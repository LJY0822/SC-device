const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');
let navigations=0,saves=0,prompts=0,choice=true,success=true;
const context=vm.createContext({console,State:{switchPage(){navigations++;}},Chat:{_toast(){}},document:{}});
vm.runInContext(fs.readFileSync('scripts/character.js','utf8'),context);
context.prompt=async()=>{prompts++;return choice;};context.save=async()=>{saves++;return success;};
vm.runInContext('Character.confirmEditExit=prompt;Character.saveCharacter=save;Character.loadCharacters=async()=>{};Character.resetEditForm=()=>{Character.formDirty=false;}',context);
const run=code=>vm.runInContext(code,context);
(async()=>{
 await run('Character.handleEditBack()');assert.equal(prompts,0);assert.equal(navigations,1);
 await run('Character.formDirty=true;Promise.all([Character.handleEditBack(),Character.handleEditBack()])');assert.equal(prompts,1);assert.equal(saves,1);assert.equal(navigations,2,'one exit per prompt');
 choice=false;await run('Character.formDirty=true;Character.handleEditBack()');assert.equal(saves,1);assert.equal(navigations,3);
 success=false;await run('Character.formDirty=true;Character.handleEditBack({save:true})');assert.equal(navigations,3,'validation failure must preserve edit page');
 assert.equal(run('Character.formDirty'),true);assert.equal(run('Character._editExitPending'),false);
 console.log('PASS character exit: unchanged, save, discard, duplicate taps and invalid form');
})().catch(e=>{console.error(e);process.exitCode=1;});
