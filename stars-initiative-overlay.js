// ------------------------------
// SETTINGS
// ------------------------------

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

// ------------------------------
// FLAG HELPERS (PERSISTENCE)
// ------------------------------

function getDiceStates(tokenDoc) {
  return tokenDoc.getFlag(MODULE_ID, "diceStates") || [];
}

async function setDiceStates(tokenDoc, states) {
  await tokenDoc.setFlag(MODULE_ID, "diceStates", states);
}

// ------------------------------
// MARKER CREATION
// ------------------------------

function createInitiativeMarker(tokenCanvas, text = "?") {
  try {
    const container = new PIXI.Container();

    const baseTexture = PIXI.Texture.from(
      "modules/stars-initiative-overlay/img/DiceSlotIcon.webp"
    );

    const activeTexture = PIXI.Texture.from(
      "modules/stars-initiative-overlay/img/DiceSlotIcon2.webp"
    );

    const bgSprite = new PIXI.Sprite(baseTexture);
    bgSprite.anchor.set(0.5);
    bgSprite.scale.set(0.4);

    const marker = new PIXI.Text(text, {
      fontFamily: "Arial",
      fontSize: 48,
      fill: 0xffffff,
      stroke: 0x000000,
      strokeThickness: 5,
      align: "center"
    });

    marker.anchor.set(0.5);

    container.addChild(bgSprite);
    container.addChild(marker);

    container._marker = marker;
    container._bgSprite = bgSprite;
    container._baseTexture = baseTexture;
    container._activeTexture = activeTexture;
    container._isActive = false;

    tokenCanvas.addChild(container);

    return container;

  } catch (err) {
    console.error("❌ Error creating initiative marker:", err);
    return null;
  }
}

// ------------------------------
// HELPERS
// ------------------------------

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function cleanTokenMarkers(tokenCanvas) {
  if (!tokenCanvas?._initiativeMarkers) return;

  tokenCanvas._initiativeMarkers.forEach(marker => {
    if (marker?.parent) marker.parent.removeChild(marker);
  });

  tokenCanvas._initiativeMarkers = [];
}

function cleanAllMarkers() {
  canvas.tokens.placeables.forEach(token => {
    cleanTokenMarkers(token);
  });
}

// ------------------------------
// MAIN UPDATE FUNCTION
// ------------------------------

function updateTokenMarkers(tokenDoc, combat) {

  if (!initiativeOverlayEnabled()) {
    if (tokenDoc?.object) cleanTokenMarkers(tokenDoc.object);
    return;
  }

  if (!tokenDoc || !tokenDoc.object || !tokenDoc.actor) return;

  const tokenCanvas = tokenDoc.object;

  const inCombat =
    combat &&
    combat.active &&
    combat.combatants.some(c =>
      c.tokenId === tokenDoc.id || c.token?.id === tokenDoc.id
    );

  if (!inCombat) {
    cleanTokenMarkers(tokenCanvas);
    return;
  }

  const actor = tokenDoc.actor;
  const numDice = actor.system.speed_dice?.num_dice || 0;

  const combatants = combat.combatants
    .filter(c =>
      c.tokenId === tokenDoc.id || c.token?.id === tokenDoc.id
    )
    .sort((a, b) => (b.initiative ?? -Infinity) - (a.initiative ?? -Infinity));

  if (!tokenCanvas._initiativeMarkers)
    tokenCanvas._initiativeMarkers = [];

  const savedStates = getDiceStates(tokenDoc);

  const centerX = tokenCanvas.w / 2;
  const aboveTokenY = -clamp(tokenCanvas.h * 0.25 + 24, 28, 64);

  while (tokenCanvas._initiativeMarkers.length > numDice) {
    const marker = tokenCanvas._initiativeMarkers.pop();
    if (marker?.parent) marker.parent.removeChild(marker);
  }

  for (let i = 0; i < numDice; i++) {

    const combatant = combatants[i];
    const text =
      combatant?.initiative != null
        ? Math.round(combatant.initiative).toString()
        : "?";

    let marker = tokenCanvas._initiativeMarkers[i];

    if (!marker) {
      marker = createInitiativeMarker(tokenCanvas, text);
      if (!marker) continue;
      tokenCanvas._initiativeMarkers[i] = marker;
    } else {
      marker._marker.text = text;
    }

    const spacing = 70;
    marker.x = centerX + (i - (numDice - 1) / 2) * spacing;
    marker.y = aboveTokenY;

    // Restore saved state
    const active = savedStates[i] || false;
    marker._isActive = active;
    marker._bgSprite.texture = active
      ? marker._activeTexture
      : marker._baseTexture;
  }
}

// ------------------------------
// HOOKS
// ------------------------------

Hooks.on("createCombatant", combatant => {
  if (!initiativeOverlayEnabled()) return;
  if (!combatant.token) return;
  updateTokenMarkers(combatant.token, combatant.parent);
});

Hooks.on("updateCombatant", (combatant, updates) => {
  if (!initiativeOverlayEnabled()) return;
  if (!("initiative" in updates)) return;
  if (!combatant.token) return;
  updateTokenMarkers(combatant.token, combatant.parent);
});

Hooks.on("deleteCombatant", combatant => {
  if (!combatant.token) return;
  updateTokenMarkers(combatant.token, combatant.parent);
});

// ------------------------------
// RESET ON NEW ROUND
// ------------------------------

Hooks.on("updateCombat", (combat, updates) => {

  // Reset dice visuals only on NEW ROUND
  if ("round" in updates) {
    canvas.tokens.placeables.forEach(token => {
      const markers = token._initiativeMarkers;
      if (!markers) return;

      markers.forEach(marker => {
        marker._isActive = false;
        marker._bgSprite.texture = marker._baseTexture;
      });
    });
  }

  if (updates.active === false) {
    cleanAllMarkers();
  }
});

Hooks.on("deleteCombat", cleanAllMarkers);

// ------------------------------
// GLOBAL CLICK HANDLER (persistent across scenes/reload)
// ------------------------------

Hooks.on("canvasReady", () => {

  cleanAllMarkers();

  if (!initiativeOverlayEnabled()) return;

  const combat = game.combat;
  if (combat?.active) {
    canvas.tokens.placeables.forEach(token => {
      updateTokenMarkers(token.document, combat);
    });
  }

  // Remove previous handler to avoid duplicates
  canvas.stage.off("pointerdown", canvas.stage._diceClickHandler);

  // Attach new handler
  const handler = async (event) => {
    const pos = event.global;

    for (const token of canvas.tokens.placeables) {

      const markers = token._initiativeMarkers;
      if (!markers) continue;

      for (let i = 0; i < markers.length; i++) {

        const marker = markers[i];
        const bounds = marker.getBounds();

        const isInside =
          pos.x >= bounds.x &&
          pos.x <= bounds.x + bounds.width &&
          pos.y >= bounds.y &&
          pos.y <= bounds.y + bounds.height;

        if (!isInside) continue;

        const tokenDoc = token.document;
        let states = getDiceStates(tokenDoc);

        while (states.length < markers.length)
          states.push(false);

        states[i] = !states[i];

        await setDiceStates(tokenDoc, states);

        marker._isActive = states[i];
        marker._bgSprite.texture = states[i]
          ? marker._activeTexture
          : marker._baseTexture;

        return;
      }
    }
  };

  canvas.stage._diceClickHandler = handler;
  canvas.stage.on("pointerdown", handler);

});
