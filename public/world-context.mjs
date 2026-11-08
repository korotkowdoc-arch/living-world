/** World-card context interaction: preserve normal tap, avoid opening after long press. */
export const WORLD_LONG_PRESS_MS=550;
export const WORLD_CLICK_SUPPRESS_MS=900;
export function worldMenuPosition(clientX,clientY,viewportWidth,viewportHeight,{width=220,height=108}={}){
 const x=Number.isFinite(clientX)?clientX:8;
 const y=Number.isFinite(clientY)?clientY:8;
 const w=Number.isFinite(viewportWidth)?viewportWidth:width+16;
 const h=Number.isFinite(viewportHeight)?viewportHeight:height+16;
 return {x:Math.max(8,Math.min(x,w-width-8)),y:Math.max(8,Math.min(y,h-height-8))};
}
export function suppressWorldOpen(until,now){
 return Number.isFinite(until)&&Number.isFinite(now)&&now<until;
}
