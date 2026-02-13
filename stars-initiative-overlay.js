const MODULE_ID = "stars-initiative-overlay";

Hooks.once("init", () => {
  game.settings.register(MODULE_ID, "enabled", {
    name: "Enable Initiative Overlay",
    scope: "world",
    config: false,
    type: Boolean,
    default: true
  });
});

function initiativeOverlayEnabled() {
  return game.settings.get(MODULE_ID, "enabled");
}

// --------------------
// PERSISTENCE
// --------------------

function getDiceStates(tokenDoc) {
  return tokenDoc.getFlag(MODULE_ID, "diceStates") || [];
}

async function setDiceStates(tokenDoc, states) {
  await tokenDoc.setFlag(MODULE_ID, "diceStates", states);
}

// --------------------
// TEXTURES
// --------------------

const textures = [
  PIXI.Texture.from("modules/stars-initiative-overlay/img/DiceSlotIcon.webp"),
  PIXI.Texture.from("modules/stars-initiative-overlay/img/DiceSlotIcon2.webp"),
  PIXI.Texture.from("modules/stars-initiative-overlay/img/DiceSlotIcon3.webp")
];

// --------------------
// CLEANUP
// --------------------

function cleanTokenMarkers(tokenCanvas) {
  if (!tokenCanvas?._initiativeMarkers) return;
  tokenCanvas._initiativeMarkers.forEach(m => m.destroy({ children: true }));
  tokenCanvas._initiativeMarkers = [];
}

function cleanAllMarkers() {
  canvas.tokens.placeables.forEach(t => cleanTokenMarkers(t));
}

// --------------------
// CREATE MARKER
// --------------------

function createMarker(tokenCanvas, text, state) {
  const container = new PIXI.Container();

  const bg = new PIXI.Sprite(textures[state]);
  bg.anchor.set(0.5);
  bg.scale.set(0.4);

  const label = new PIXI.Text(text, {
    fontFamily: "Arial",
    fontSize: 48,
    fill: 0xffffff,
    stroke: 0x000000,
    strokeThickness: 5
  });
  label.anchor.set(0.5);

  container.addChild(bg);
  container.addChild(label);

  container._bg = bg;
  container._label = label;

  tokenCanvas.addChild(container);
  return container;
}

// --------------------
// RENDER
// --------------------

function renderTokenMarkers(tokenDoc, combat) {
  if (!initiativeOverlayEnabled()) return;
  if (!tokenDoc?.object || !combat?.active) return;

  const tokenCanvas = tokenDoc.object;
  const actor = tokenDoc.actor;
  if (!actor) return;

  const numDice = actor.system.speed_dice?.num_dice || 0;
  const states = getDiceStates(tokenDoc);

  const combatants = combat.combatants
    .filter(c => c.tokenId === tokenDoc.id)
    .sort((a, b) => (b.initiative ?? -Infinity) - (a.initiative ?? -Infinity));

  cleanTokenMarkers(tokenCanvas);
  tokenCanvas._initiativeMarkers = [];

  for (let i = 0; i < numDice; i++) {
    const combatant = combatants[i];
    const text = combatant?.initiative != null
      ? Math.round(combatant.initiative).toString()
      : "?";

    const state = states[i] ?? 0;
    const marker = createMarker(tokenCanvas, text, state);

    const spacing = 70;
    marker.x = tokenCanvas.w / 2 + (i - (numDice - 1) / 2) * spacing;
    marker.y = -40;

    tokenCanvas._initiativeMarkers.push(marker);
  }
}

// --------------------
// HOOKS
// --------------------

Hooks.on("canvasReady", () => {
  const combat = game.combat;
  if (combat?.active) {
    canvas.tokens.placeables.forEach(t =>
      renderTokenMarkers(t.document, combat)
    );
  }
});

Hooks.on("createCombatant", c => {
  renderTokenMarkers(c.token, c.parent);
});

Hooks.on("updateCombatant", (c, updates) => {
  if (!("initiative" in updates)) return;
  renderTokenMarkers(c.token, c.parent);
});

Hooks.on("deleteCombat", cleanAllMarkers);

// 🔥 RESET ALL DICE ON NEXT ROUND
Hooks.on("updateCombat", async (combat, updates) => {

  if ("round" in updates) {
    for (const token of canvas.tokens.placeables) {

      const actor = token.actor;
      if (!actor) continue;

      const numDice = actor.system.speed_dice?.num_dice || 0;
      if (numDice === 0) continue;

      const resetStates = Array(numDice).fill(0);
      await setDiceStates(token.document, resetStates);
    }
  }

  if (updates.active === false) cleanAllMarkers();
});

// 🔥 Multiplayer sync
Hooks.on("updateToken", (tokenDoc, changes) => {
  if (changes.flags?.[MODULE_ID]?.diceStates !== undefined) {
    renderTokenMarkers(tokenDoc, game.combat);
  }
});

// --------------------
// CLICK HANDLER
// --------------------

Hooks.on("canvasReady", () => {

  canvas.stage.off("pointerdown", canvas.stage._diceHandler);

  const handler = async event => {
    const pos = event.global;

    for (const token of canvas.tokens.placeables) {
      const markers = token._initiativeMarkers;
      if (!markers) continue;

      for (let i = 0; i < markers.length; i++) {
        const m = markers[i];
        const b = m.getBounds();

        const inside =
          pos.x >= b.x &&
          pos.x <= b.x + b.width &&
          pos.y >= b.y &&
          pos.y <= b.y + b.height;

        if (!inside) continue;

        let states = getDiceStates(token.document);
        while (states.length < markers.length) states.push(0);

        states[i] = (states[i] + 1) % 3;
        await setDiceStates(token.document, states);
        return;
      }
    }
  };

  canvas.stage._diceHandler = handler;
  canvas.stage.on("pointerdown", handler);
});
