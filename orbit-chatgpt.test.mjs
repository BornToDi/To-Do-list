import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign} from 'node:crypto';
import {validateIdentity} from './orbit-chatgpt.mjs';
import {readPlanStream} from './orbit-ai.mjs';
test('verifies signed ID token and rejects wrong nonce, audience, expiry and tampering',async()=>{
 const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});const jwk=publicKey.export({format:'jwk'});jwk.kid='test';
 const claims={iss:'https://auth.openai.com',aud:'client',sub:'user',nonce:'nonce',exp:Math.floor(Date.now()/1000)+300};
 const tokenFor=c=>{const base=Buffer.from(JSON.stringify({alg:'RS256',kid:'test'})).toString('base64url')+'.'+Buffer.from(JSON.stringify(c)).toString('base64url');return base+'.'+sign('RSA-SHA256',Buffer.from(base),privateKey).toString('base64url');};
 const options={clientId:'client',nonce:'nonce',keys:[jwk]};assert.equal((await validateIdentity(tokenFor(claims),options)).sub,'user');
 for(const c of [{...claims,nonce:'bad'},{...claims,aud:'bad'},{...claims,exp:0}])await assert.rejects(validateIdentity(tokenFor(c),options));
 const t=tokenFor(claims).split('.');t[1]=Buffer.from(JSON.stringify({...claims,sub:'attacker'})).toString('base64url');await assert.rejects(validateIdentity(t.join('.'),options));
});
test('accepts completed streams and rejects partial and plan-limit failure streams',async()=>{
 const event=e=>'data: '+JSON.stringify(e)+'\n\n';const delta=event({type:'response.output_text.delta',delta:'Hello'});
 assert.equal((await readPlanStream(new Response(delta+event({type:'response.completed'})))).answer,'Hello');
 assert.equal((await readPlanStream(new Response(delta))).status,502);
 assert.equal((await readPlanStream(new Response(delta+event({type:'response.failed'})))).status,502);
});
