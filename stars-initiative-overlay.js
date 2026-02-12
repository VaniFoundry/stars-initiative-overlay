// ------------------------------
// SETTINGS
// ------------------------------

const MODULE_ID = "stars-initiative-overlay";

Hooks.once("init", () => {
  game.settings.register(MODULE_ID, "enabled", {
    name: "Enable Initiative Overlay",
    hint: "Show initiative markers above tokens.",
    scope: "world",
    config: false, // hidden (controlled by macro)
    type: Boolean,
    default: true
  });
});

function initiativeOverlayEnabled() {
  return game.settings.get(MODULE_ID, "enabled");
}

// ------------------------------
// MARKER CREATION
// ------------------------------

function createInitiativeMarker(tokenCanvas, text = "?") {
  try {
    const container = new PIXI.Container();

    const bgTexture = PIXI.Texture.from(
      "modules/stars-initiative-overlay/img/DiceSlotIcon.webp"
    );

    const bgSprite = new PIXI.Sprite(bgTexture);
    bgSprite.anchor.set(0.5);
    bgSprite.scale.set(0.4);
    container.addChild(bgSprite);

    const marker = new PIXI.Text(text, {
      fontFamily: "Arial",
      fontSize: 48,
      fill: 0xffffff,
      stroke: 0x000000,
      strokeThickness: 5,
      align: "center"
    });

    marker.anchor.set(0.5);
    container.addChild(marker);

    container._marker = marker;

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

  // 🚫 If disabled, wipe markers and stop
  if (!initiativeOverlayEnabled()) {
    if (tokenDoc?.object) cleanTokenMarkers(tokenDoc.object);
    return;
  }

  if (!tokenDoc || !tokenDoc.object || !tokenDoc.actor) return;

  const tokenCanvas = tokenDoc.object;

  // If not in combat → remove markers
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

  const centerX = tokenCanvas.w / 2;
  const aboveTokenY = -clamp(tokenCanvas.h * 0.25 + 24, 28, 64);

  // Remove extra markers
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

// Combat ends
Hooks.on("updateCombat", (combat, updates) => {
  if (updates.active === false) {
    cleanAllMarkers();
  }
});

// Combat deleted
Hooks.on("deleteCombat", cleanAllMarkers);

// Scene change
Hooks.on("canvasReady", () => {
  cleanAllMarkers();

  if (!initiativeOverlayEnabled()) return;

  const combat = game.combat;
  if (combat?.active) {
    canvas.tokens.placeables.forEach(token => {
      updateTokenMarkers(token.document, combat);
    });
  }
});