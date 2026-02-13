const MODULE_ID = "stars-initiative-overlay";

Hooks.once("init", () => {
  game.settings.register(MODULE_ID, "enabled", {
    name: "Enable Initiative Overlay",
    hint: "Show initiative markers above tokens.",
    scope: "world",
    config: false,
    type: Boolean,
    default: true
  });
});

function initiativeOverlayEnabled() {
  return game.settings.get(MODULE_ID, "enabled");
}

// persistence
function getDiceStates(tokenDoc) {
  return tokenDoc.getFlag(MODULE_ID, "diceStates") || [];
}
async function setDiceStates(tokenDoc, states) {
  await tokenDoc.setFlag(MODULE_ID, "diceStates", states);
}

// textures
const textures = [
  PIXI.Texture.from("modules/stars-initiative-overlay/img/DiceSlotIcon.webp"),
  PIXI.Texture.from("modules/stars-initiative-overlay/img/DiceSlotIcon2.webp"),
  PIXI.Texture.from("modules/stars-initiative-overlay/img/DiceSlotIcon3.webp")
];

function createInitiativeMarker(tokenCanvas, text="?", state=0){
  try {
    const container = new PIXI.Container();
    const bgSprite = new PIXI.Sprite(textures[state]);
    bgSprite.anchor.set(0.5);
    bgSprite.scale.set(0.4);
    const marker = new PIXI.Text(text,{
      fontFamily:"Arial", fontSize:48, fill:0xffffff, stroke:0x000000,
      strokeThickness:5, align:"center"
    });
    marker.anchor.set(0.5);
    container.addChild(bgSprite);
    container.addChild(marker);
    container._marker = marker;
    container._bgSprite = bgSprite;
    container._state = state;
    tokenCanvas.addChild(container);
    return container;
  } catch(e){ console.error("Error creating marker",e); return null; }
}

function clamp(v,min,max){return Math.min(Math.max(v,min),max);}
function cleanTokenMarkers(tokenCanvas){
  if(!tokenCanvas?._initiativeMarkers) return;
  tokenCanvas._initiativeMarkers.forEach(m=>{if(m?.parent)m.parent.removeChild(m);});
  tokenCanvas._initiativeMarkers=[];
}
function cleanAllMarkers(){canvas.tokens.placeables.forEach(cleanTokenMarkers);}

function updateTokenMarkers(tokenDoc, combat){
  if(!initiativeOverlayEnabled()){ if(tokenDoc?.object) cleanTokenMarkers(tokenDoc.object); return;}
  if(!tokenDoc?.object || !tokenDoc.actor) return;

  const tokenCanvas = tokenDoc.object;
  const inCombat = combat?.active && combat.combatants.some(c=>c.tokenId===tokenDoc.id||c.token?.id===tokenDoc.id);
  if(!inCombat){ cleanTokenMarkers(tokenCanvas); return; }

  const actor = tokenDoc.actor;
  const numDice = actor.system.speed_dice?.num_dice||0;
  const combatants = combat.combatants
    .filter(c=>c.tokenId===tokenDoc.id||c.token?.id===tokenDoc.id)
    .sort((a,b)=>(b.initiative??-Infinity)-(a.initiative??-Infinity));

  if(!tokenCanvas._initiativeMarkers) tokenCanvas._initiativeMarkers=[];
  const savedStates = getDiceStates(tokenDoc);
  const centerX = tokenCanvas.w/2;
  const aboveY = -clamp(tokenCanvas.h*0.25+24,28,64);

  while(tokenCanvas._initiativeMarkers.length>numDice){
    const m=tokenCanvas._initiativeMarkers.pop();
    if(m?.parent) m.parent.removeChild(m);
  }

  for(let i=0;i<numDice;i++){
    const combatant = combatants[i];
    const text = combatant?.initiative!=null?Math.round(combatant.initiative).toString():"?";
    let marker = tokenCanvas._initiativeMarkers[i];
    const state = savedStates[i]||0;

    if(!marker){
      marker = createInitiativeMarker(tokenCanvas,text,state);
      tokenCanvas._initiativeMarkers[i]=marker;
    } else {
      marker._marker.text=text;
      marker._state=state;
      marker._bgSprite.texture=textures[state];
    }

    const spacing=70;
    marker.x=centerX + (i-(numDice-1)/2)*spacing;
    marker.y=aboveY;
  }
}

// hooks
Hooks.on("createCombatant", c=>{if(!initiativeOverlayEnabled()||!c.token) return; updateTokenMarkers(c.token,c.parent);});
Hooks.on("updateCombatant",(c,u)=>{if(!initiativeOverlayEnabled()||!("initiative" in u)||!c.token) return; updateTokenMarkers(c.token,c.parent);});
Hooks.on("deleteCombatant",c=>{if(c.token) updateTokenMarkers(c.token,c.parent);});

// reset dice on new round, clear markers on combat end
Hooks.on("updateCombat",async(combat,updates)=>{
  if("round" in updates){
    for(const token of canvas.tokens.placeables){
      const markers = token._initiativeMarkers; if(!markers) continue;
      markers.forEach(m=>{m._state=0; m._bgSprite.texture=textures[0];});
      await token.document.setFlag(MODULE_ID,"diceStates",markers.map(()=>0));
    }
  }
  if(updates.active===false) cleanAllMarkers();
});
Hooks.on("deleteCombat", cleanAllMarkers);

// click handler
Hooks.on("canvasReady",()=>{
  cleanAllMarkers();
  if(!initiativeOverlayEnabled()) return;
  const combat = game.combat;
  if(combat?.active) canvas.tokens.placeables.forEach(t=>updateTokenMarkers(t.document,combat));

  canvas.stage.off("pointerdown",canvas.stage._diceClickHandler);
  const handler = async e=>{
    const pos=e.global;
    for(const token of canvas.tokens.placeables){
      const markers=token._initiativeMarkers; if(!markers) continue;
      for(let i=0;i<markers.length;i++){
        const m=markers[i];
        const b=m.getBounds();
        const inside = pos.x>=b.x && pos.x<=b.x+b.width && pos.y>=b.y && pos.y<=b.y+b.height;
        if(!inside) continue;

        let states = getDiceStates(token.document);
        while(states.length<markers.length) states.push(0);

        states[i]=(states[i]+1)%3;
        await setDiceStates(token.document,states);

        m._state=states[i];
        m._bgSprite.texture=textures[states[i]];
        return;
      }
    }
  };
  canvas.stage._diceClickHandler=handler;
  canvas.stage.on("pointerdown",handler);
});
