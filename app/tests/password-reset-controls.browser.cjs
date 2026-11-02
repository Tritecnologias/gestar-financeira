// Shared, focused checks for the real AccountClient form in both password states.
const assert=require('node:assert/strict');
const ids=['current-password','new-password','confirm-password'];
const typeIs=(page,id,type)=>page.waitForFunction(({id,type})=>document.getElementById(id)?.type===type,{id,type});
async function passwordControls(page,{required,mobile}){
 const url=page.url();let posts=0;const observe=r=>{if(r.method()==='POST')posts++;};page.on('request',observe);
 const cdp=await page.context().newCDPSession(page);
 try{
  assert.equal(await page.getByText('Para conferir a senha, mantenha o olho pressionado. No teclado, mantenha Alt+Shift+V pressionado no campo.',{exact:true}).count(),1);
  for(const id of ids){
   const field=page.locator('#'+id),eye=page.locator(`button[aria-controls="${id}"]`),value=await field.inputValue();
   assert.equal(await eye.getAttribute('type'),'button');assert.equal(await eye.getAttribute('tabindex'),'-1');assert.equal(await eye.getAttribute('data-reveal'),'hold');assert.equal(await eye.getAttribute('aria-keyshortcuts'),'Alt+Shift+V');
   assert((await field.getAttribute('aria-describedby')).split(' ').includes('account-password-help'));
   await field.focus();await eye.scrollIntoViewIfNeeded();let box=await eye.boundingBox();assert(box.width>=44&&box.height>=44);
   const center=()=>({x:box.x+box.width/2,y:box.y+box.height/2});
   await page.mouse.move(center().x,center().y);await page.mouse.down();await typeIs(page,id,'text');assert(await field.evaluate(e=>e===document.activeElement));
   for(const other of ids.filter(x=>x!==id))assert.equal(await page.locator('#'+other).getAttribute('type'),'password');
   await page.mouse.up();await typeIs(page,id,'password');assert(await field.evaluate(e=>e===document.activeElement));
   await page.mouse.down();await typeIs(page,id,'text');await page.mouse.move(1,1);await typeIs(page,id,'password');await page.mouse.up();
   await field.focus();await page.keyboard.down('Alt');await page.keyboard.down('Shift');await page.keyboard.down('v');await typeIs(page,id,'text');
   assert(await field.evaluate(e=>e===document.activeElement));await page.keyboard.up('Shift');await typeIs(page,id,'password');await page.keyboard.up('v');await page.keyboard.up('Alt');
   // The control remains usable when assistive technology explicitly focuses it.
   for(const key of ['Space','Enter']){await eye.focus();await page.keyboard.down(key);await typeIs(page,id,'text');await page.keyboard.up(key);await typeIs(page,id,'password');}
   await eye.focus();await page.keyboard.down('Space');await typeIs(page,id,'text');await field.focus();await typeIs(page,id,'password');await page.keyboard.up('Space');
   await eye.scrollIntoViewIfNeeded();box=await eye.boundingBox();await page.mouse.move(center().x,center().y);await page.mouse.down();await typeIs(page,id,'text');
   await page.evaluate(()=>window.dispatchEvent(new Event('blur')));await typeIs(page,id,'password');await page.mouse.up();
   if(mobile){
    await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:true});
    for(const ending of ['touchEnd','touchCancel']){
     await field.focus();await eye.scrollIntoViewIfNeeded();box=await eye.boundingBox();
     await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...center(),id:1}]});await typeIs(page,id,'text');assert(await field.evaluate(e=>e===document.activeElement));
     await cdp.send('Input.dispatchTouchEvent',{type:ending,touchPoints:[]});await typeIs(page,id,'password');assert(await field.evaluate(e=>e===document.activeElement));
    }
    await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:false});
   }
   assert.equal(await field.inputValue(),value);assert.equal(await eye.getAttribute('aria-pressed'),'false');
  }
  await page.locator('#current-password').focus();
  for(const id of ids.slice(1)){await page.keyboard.press('Tab');assert.equal(await page.locator(':focus').getAttribute('id'),id);}
  await page.keyboard.press('Tab');
  if(!required){assert(await page.getByRole('button',{name:'Cancelar',exact:true}).evaluate(e=>e===document.activeElement));await page.keyboard.press('Tab');}
  assert(await page.getByRole('button',{name:'Salvar nova senha',exact:true}).evaluate(e=>e===document.activeElement));
  if(!required){await page.keyboard.press('Shift+Tab');assert(await page.getByRole('button',{name:'Cancelar',exact:true}).evaluate(e=>e===document.activeElement));}
  for(const id of [...ids].reverse()){await page.keyboard.press('Shift+Tab');assert.equal(await page.locator(':focus').getAttribute('id'),id);}
  assert.equal(posts,0);assert.equal(page.url(),url);
  return{fields:3,mouse:true,keyboardShortcut:true,assistiveFocus:true,touchReleaseCancel:mobile,tabOrder:required?[...ids,'Salvar nova senha']:[...ids,'Cancelar','Salvar nova senha'],unchangedValuesAndFocus:true,postsFromControls:0,navigationFromControls:0};
 }finally{await cdp.detach();page.off('request',observe);}
}
module.exports={passwordControls};
