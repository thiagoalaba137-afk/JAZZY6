import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {initialAccountsFor} from '../server/initial-accounts.mjs';
import {createAccounts,passwordMatches} from '../server/accounts.mjs';
test('new deployments seed from private environment; existing accounts are retained',()=>{
 const db=new DatabaseSync(':memory:');try{
  assert.throws(()=>initialAccountsFor(db,{}),/JAZZY_HYU_PASSWORD/);
  const seeds=initialAccountsFor(db,{JAZZY_HYU_PASSWORD:'hyu-test-password',JAZZY_JAZZY_PASSWORD:'jazzy-test-password'});
  assert.equal(seeds.length,2);assert.ok(passwordMatches('hyu-test-password',seeds[0]));
  const accounts=createAccounts(db,seeds);assert.ok(accounts.login('hyusukk','hyu-test-password'));
  assert.deepEqual(initialAccountsFor(db,{}),[]);
 }finally{db.close();}
});
