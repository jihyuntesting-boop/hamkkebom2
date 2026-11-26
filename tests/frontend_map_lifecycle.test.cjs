const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const test=require('node:test');

test('map cleanup isolates partially initialized SDK objects from navigation',()=>{
  const source=fs.readFileSync(path.join(__dirname,'../web/assets/core-src/50-map-and-startup.js'),'utf8');
  const end=source.indexOf("addEventListener('hashchange',render)");
  assert.ok(end>0);
  const context=vm.createContext({calls:[]});
  vm.runInContext(source.slice(0,end),context);
  vm.runInContext(`
    nearbyMap={destroy(){calls.push('map');throw Error('SDK teardown failed')}};
    nearbyLayer=[
      {setMap(){calls.push('first marker');throw Error('SDK marker failed')}},
      {setMap(){calls.push('second marker')}}
    ];
    dropNearbyMap();
    dropNearbyMap();
  `,context);
  assert.deepEqual(context.calls,['first marker','second marker','map']);
  assert.equal(vm.runInContext('nearbyMap===null&&nearbyLayer===null',context),true);
});
