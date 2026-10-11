import { randomBytes, randomUUID, createHash, createPublicKey, verify } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
const issuer='https://auth.openai.com';
const resource='https://api.openai.com/v1';
export async function validateIdentity(token,{clientId,nonce,keys}){
 const parts=token?.split('.');if(parts?.length!==3)throw Error('Invalid identity');
 const header=JSON.parse(Buffer.from(parts[0],'base64url')),claims=JSON.parse(Buffer.from(parts[1],'base64url'));
 if(header.alg!=='RS256')throw Error('Invalid signature algorithm');
 const key=keys.find(k=>k.kid===header.kid&&k.kty==='RSA');
 if(!key||!verify('RSA-SHA256',Buffer.from(parts[0]+'.'+parts[1]),createPublicKey({key,format:'jwk'}),Buffer.from(parts[2],'base64url')))throw Error('Invalid signature');
 if(claims.iss!==issuer||!(Array.isArray(claims.aud)?claims.aud.includes(clientId):claims.aud===clientId)||!Number.isFinite(claims.exp)||claims.exp<=Date.now()/1000||claims.nonce!==nonce||typeof claims.sub!=='string'||!claims.sub)throw Error('Invalid identity claims');
 return claims;
}
export function createChatGPTConnection(port){
 const sessions=new Map(),pending=new Map();
 let hostId;
 const hostFile=new URL('.orbit-host.json',import.meta.url);
 async function host(){if(hostId)return hostId;try{hostId=JSON.parse(await readFile(hostFile,'utf8')).hostId;}catch(e){if(e.code!=='ENOENT')throw e;hostId='urn:uuid:'+randomUUID();await writeFile(hostFile,JSON.stringify({hostId}),{mode:0o600});}return hostId;}
 const cookie=req=>req.headers.cookie?.split(';').map(s=>s.trim()).find(s=>s.startsWith('orbit_session='))?.slice(14);
 const setCookie=(res,id)=>res.setHeader('Set-Cookie',`orbit_session=${id}; HttpOnly; SameSite=Lax; Path=/; Max-Age=28800`);
 async function tokenRequest(params){const r=await fetch(issuer+'/api/accounts/oauth/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(params),signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('ChatGPT token exchange failed. Please sign in again.');return r.json();}
 async function credentials(req){const session=sessions.get(cookie(req));if(!session)throw Error('Continue with ChatGPT to connect your plan.');
  if(session.expiresAt<Date.now()+60000){if(!session.refresh_token)throw Error('Please sign in again.');if(!session.refreshing)session.refreshing=tokenRequest({grant_type:'refresh_token',client_id:session.client_id,refresh_token:session.refresh_token,resource}).then(t=>{if(!t.access_token)throw Error('Please sign in again.');session.access_token=t.access_token;session.refresh_token=t.refresh_token||session.refresh_token;session.expiresAt=Date.now()+(t.expires_in||3600)*1000;}).finally(()=>{session.refreshing=null;});await session.refreshing;}
  return session;
 }
 async function handle(req,res,path,json){
  if(!path.startsWith('/auth/')&&path!=='/api/chatgpt/status')return false;
  if(path==='/api/chatgpt/status'&&req.method==='GET'){const s=sessions.get(cookie(req));json(200,{connected:Boolean(s),email:s?.email||null,provider:'chatgpt'});return true;}
  if(path==='/auth/callback'&&req.method==='GET'){
   const url=new URL(req.url,`http://127.0.0.1:${port}`),state=url.searchParams.get('state'),attempt=pending.get(state);pending.delete(state);
   try{
    if(!attempt||attempt.expires<Date.now()||attempt.cookie!==cookie(req))throw Error('Invalid or expired login.');
    if(url.searchParams.has('error'))throw Error('Login was not approved.');
    const clientId=url.searchParams.get('client_id');if(!clientId||clientId==='dynamic_agent_client'||!url.searchParams.get('code'))throw Error('Registration incomplete.');
    const tokens=await tokenRequest({grant_type:'authorization_code',client_id:clientId,code:url.searchParams.get('code'),code_verifier:attempt.verifier,redirect_uri:attempt.redirect,resource});
    const jwks=await fetch(issuer+'/.well-known/jwks.json',{signal:AbortSignal.timeout(20000)});if(!jwks.ok)throw Error('Identity verification unavailable.');
    const identity=await validateIdentity(tokens.id_token,{clientId,nonce:attempt.nonce,keys:(await jwks.json()).keys});
    const scopes=new Set((tokens.scope||'').split(' '));if(!scopes.has('chatgpt.tokens.use.direct')||!scopes.has('resource.invoke')||!tokens.access_token)throw Error('ChatGPT plan permission was not granted.');
    sessions.delete(cookie(req));const id=randomBytes(32).toString('base64url');
    sessions.set(id,{access_token:tokens.access_token,refresh_token:tokens.refresh_token,client_id:clientId,subject:identity.sub,email:identity.email,expiresAt:Date.now()+(tokens.expires_in||3600)*1000});setCookie(res,id);res.writeHead(303,{Location:'/?chatgpt=connected','Cache-Control':'no-store','Referrer-Policy':'no-referrer'});res.end();
   }catch{res.writeHead(303,{Location:'/?chatgpt=failed','Cache-Control':'no-store','Referrer-Policy':'no-referrer'});res.end();}return true;
  }
  if(req.method!=='POST'||req.headers.origin!==`http://${req.headers.host}`){json(403,{error:'Invalid sign-in request.'});return true;}
  if(path==='/auth/logout'){sessions.delete(cookie(req));res.setHeader('Set-Cookie','orbit_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');json(200,{ok:true});return true;}
  if(path==='/auth/start'){
   try{if(req.headers.host!==`127.0.0.1:${port}`){json(400,{error:`Open http://127.0.0.1:${port} to connect ChatGPT.`});return true;}
    for(const [key,value]of pending)if(value.expires<Date.now())pending.delete(key);
    const state=randomBytes(32).toString('base64url'),nonce=randomBytes(32).toString('base64url'),verifier=randomBytes(32).toString('base64url'),id=cookie(req)||randomBytes(32).toString('base64url'),redirect=`http://127.0.0.1:${port}/auth/callback`;setCookie(res,id);
    pending.set(state,{nonce,verifier,cookie:id,redirect,expires:Date.now()+600000});
    const url=new URL(issuer+'/api/accounts/authorize');url.search=new URLSearchParams({client_id:'dynamic_agent_client',agent_name_hint:'Orbit',ext_agent_host_id:await host(),response_type:'code',redirect_uri:redirect,scope:'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct',resource,state,nonce,code_challenge_method:'S256',code_challenge:createHash('sha256').update(verifier).digest('base64url')}).toString();json(200,{url:url.href});
   }catch{json(503,{error:'Could not start ChatGPT sign-in. Please retry.'});}return true;
  }
  json(404,{error:'Not found.'});return true;
 }
 async function options(req){const s=await credentials(req);const r=await fetch(resource+'/models',{headers:{Authorization:`Bearer ${s.access_token}`},signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('Cannot load models for your ChatGPT plan. Please sign in again.');const models=(await r.json()).models?.filter(m=>m.visibility==='list')||[];if(!models.length)throw Error('No models available for this ChatGPT connection.');const model=models.find(m=>m.slug===process.env.CHATGPT_MODEL)||models[0];return{apiKey:s.access_token,model:model.slug,plan:true};}
 return{handle,options};
}
