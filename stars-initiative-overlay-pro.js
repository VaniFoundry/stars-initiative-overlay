// ------------------------------
// Stars Initiative Overlay (STABLE ABOVE TOKEN)
// ------------------------------

// Crear marcador
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
    console.error("❌ Error al crear marcador:", err);
    return null;
  }
}

// Clamp helper
function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

// Actualizar marcadores
function updateTokenMarkers(tokenDoc, combat) {
  if (!tokenDoc) return;

  const tokenCanvas = tokenDoc.object;
  if (!tokenCanvas) return;

  const actor = tokenDoc.actor;
  if (!actor) return;

  const numDice = actor.system.speed_dice?.num_dice || 0;

  const combatants = combat.combatants.filter(c =>
    c.tokenId === tokenDoc.id || c.token?.id === tokenDoc.id
  );

  if (!tokenCanvas._initiativeMarkers) {
    tokenCanvas._initiativeMarkers = [];
  }

  combatants.sort((a, b) => (b.initiative ?? -Infinity) - (a.initiative ?? -Infinity));

  const centerX = tokenCanvas.w / 2;

  // 🔑 Y controlada (proporción + límites)
  const proportionalOffset = tokenCanvas.h * 0.25 + 24; // 25% del alto + 24 plano para compensar tokens pequeños
  const aboveTokenY = -clamp(proportionalOffset, 28, 64);
  // min: 28px | max: 64px

  // Limpiar sobrantes
  while (tokenCanvas._initiativeMarkers.length > numDice) {
    const marker = tokenCanvas._initiativeMarkers.pop();
    if (marker?.parent) marker.parent.removeChild(marker);
  }

  // Crear / actualizar
  for (let i = 0; i < numDice; i++) {
    const combatant = combatants[i];
    const text =
      combatant?.initiative !== null && combatant?.initiative !== undefined
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
    const offsetX = (i - (numDice - 1) / 2) * spacing;

    marker.x = centerX + offsetX;
    marker.y = aboveTokenY;
  }

  console.log(`✅ Marcadores actualizados: ${tokenDoc.name}`);
}

// ------------------------------
// Hooks
// ------------------------------

Hooks.on("createCombatant", combatant => {
  if (!combatant.token) return;
  updateTokenMarkers(combatant.token, combatant.parent);
});

Hooks.on("updateCombatant", (combatant, updates) => {
  if (!("initiative" in updates)) return;
  if (!combatant.token) return;
  updateTokenMarkers(combatant.token, combatant.parent);
});

Hooks.on("deleteCombatant", combatant => {
  if (!combatant.token) return;
  updateTokenMarkers(combatant.token, combatant.parent);
});

// Limpiar todo
function cleanAllMarkers() {
  canvas.tokens.placeables.forEach(token => {
    const tokenCanvas = token.object;
    if (!tokenCanvas?._initiativeMarkers) return;

    tokenCanvas._initiativeMarkers.forEach(marker => {
      if (marker?.parent) marker.parent.removeChild(marker);
    });

    tokenCanvas._initiativeMarkers = [];
  });

  console.log("🗑 Marcadores limpiados");
}

Hooks.on("deleteCombat", cleanAllMarkers);

