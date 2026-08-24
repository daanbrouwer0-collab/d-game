/* MERGE-BLOCK: app-menu.js — menu popup + instellingen */

const AppMenu = (() => {

  let popup;

  let scrim;

  let popupOpen = false;



  function init() {

    popup = document.getElementById('menu-popup');

    scrim = document.getElementById('menu-scrim');



    popup?.querySelectorAll('[data-menu-page]').forEach((btn) => {

      btn.addEventListener('click', () => {

        const page = btn.dataset.menuPage;

        closeAll();

        Nav.switchMenuPage(page);

      });

    });



    scrim?.addEventListener('click', () => closeAll());



    initSettings();

    initMoreActions();

  }



  function togglePopup() {

    if (popupOpen) {

      closePopup();

      return;

    }

    Nav.rememberTabBeforeMenu();

    openPopup();

  }



  function openPopup() {

    if (!popup) return;

    popupOpen = true;

    popup.classList.add('open');

    popup.setAttribute('aria-hidden', 'false');

    scrim?.classList.remove('hidden');

    scrim?.setAttribute('aria-hidden', 'false');

    Nav.setMenuNavActive(true);

  }



  function closePopup() {

    if (!popup) return;

    popupOpen = false;

    popup.classList.remove('open');

    popup.setAttribute('aria-hidden', 'true');

    scrim?.classList.add('hidden');

    scrim?.setAttribute('aria-hidden', 'true');

    Nav.setMenuNavActive(false);

  }



  function closeAll() {

    closePopup();

  }



  function initMoreActions() {

    document.getElementById('btn-app-save')?.addEventListener('click', () => {

      Menu.saveFromApp();

    });

  }



  function syncToggle(el, on, label) {

    if (!el) return;

    el.classList.toggle('active', on);

    el.setAttribute('aria-pressed', on ? 'true' : 'false');

    el.textContent = `${label}: ${on ? 'AAN' : 'UIT'}`;

  }



  function initSettings() {

    const toggleVibration = document.getElementById('toggle-vibration');

    const toggleSoundSettings = document.getElementById('toggle-sound-settings');

    const settings = Storage.readSettings();



    if (toggleVibration) {

      const vibOn = settings.vibration !== false;

      syncToggle(toggleVibration, vibOn, 'Trillen');

      toggleVibration.addEventListener('click', () => {

        const next = !toggleVibration.classList.contains('active');

        syncToggle(toggleVibration, next, 'Trillen');

        Storage.writeSettings({ ...Storage.readSettings(), vibration: next });

        Toast.show(next ? 'Trillen ingeschakeld' : 'Trillen uitgeschakeld');

      });

    }



    if (toggleSoundSettings) {

      const soundOn = !!settings.sound;

      syncToggle(toggleSoundSettings, soundOn, 'Geluid');

      toggleSoundSettings.addEventListener('click', () => {

        const next = !toggleSoundSettings.classList.contains('active');

        syncToggle(toggleSoundSettings, next, 'Geluid');

        Storage.writeSettings({ ...Storage.readSettings(), sound: next });

        Toast.show(next ? 'Geluid ingeschakeld' : 'Geluid uitgeschakeld');

      });

    }



    const physicsPlayerWeight = document.getElementById('physics-player-weight');

    const physicsBeamMass = document.getElementById('physics-beam-mass');

    const physicsWalkwayMass = document.getElementById('physics-walkway-mass');

    const physicsStiffness = document.getElementById('physics-stiffness');

    const physicsStrength = document.getElementById('physics-strength');

    const physicsQuality = document.getElementById('physics-quality');

    const togglePhysicsStress = document.getElementById('toggle-physics-stress');

    const playerWeightVal = document.getElementById('physics-player-weight-val');

    const beamMassVal = document.getElementById('physics-beam-mass-val');

    const walkwayMassVal = document.getElementById('physics-walkway-mass-val');

    const stiffnessVal = document.getElementById('physics-stiffness-val');

    const strengthVal = document.getElementById('physics-strength-val');

    const qualityVal = document.getElementById('physics-quality-val');



    const syncPhysicsUi = () => {

      const cfg = SideViewGame.getPhysicsSettings();

      const stiffPct = Math.round((cfg.stiffnessMul || 1) * 100);

      const strPct = Math.round((cfg.strengthMul || 1) * 100);

      const qualPct = Math.round((cfg.qualityMul || 1) * 100);

      const weightKg = Math.round(cfg.playerWeightKg || 72);

      const beamPct = Math.round((cfg.beamMassMul || 1) * 100);

      const walkPct = Math.round((cfg.walkwayMassMul || 1) * 100);

      if (physicsPlayerWeight) physicsPlayerWeight.value = String(weightKg);

      if (physicsBeamMass) physicsBeamMass.value = String(beamPct);

      if (physicsWalkwayMass) physicsWalkwayMass.value = String(walkPct);

      if (physicsStiffness) physicsStiffness.value = String(stiffPct);

      if (physicsStrength) physicsStrength.value = String(strPct);

      if (physicsQuality) physicsQuality.value = String(qualPct);

      if (playerWeightVal) playerWeightVal.textContent = `${weightKg} kg`;

      if (beamMassVal) beamMassVal.textContent = `${beamPct}%`;

      if (walkwayMassVal) walkwayMassVal.textContent = `${walkPct}%`;

      if (stiffnessVal) stiffnessVal.textContent = `${stiffPct}%`;

      if (strengthVal) strengthVal.textContent = `${strPct}%`;

      if (qualityVal) qualityVal.textContent = `${qualPct}%`;

      if (togglePhysicsStress) syncToggle(togglePhysicsStress, cfg.stressTint !== false, 'Stress');

      SideViewGame.updatePanelStats?.();

    };

    const applyPhysics = (patch) => {

      SideViewGame.setPhysicsSettings(patch);

      syncPhysicsUi();

    };

    syncPhysicsUi();



    physicsPlayerWeight?.addEventListener('input', () => {

      applyPhysics({ playerWeightKg: Number(physicsPlayerWeight.value) });

    });

    physicsBeamMass?.addEventListener('input', () => {

      applyPhysics({ beamMassMul: Number(physicsBeamMass.value) / 100 });

    });

    physicsWalkwayMass?.addEventListener('input', () => {

      applyPhysics({ walkwayMassMul: Number(physicsWalkwayMass.value) / 100 });

    });

    physicsStiffness?.addEventListener('input', () => {

      applyPhysics({ stiffnessMul: Number(physicsStiffness.value) / 100 });

    });

    physicsStrength?.addEventListener('input', () => {

      applyPhysics({ strengthMul: Number(physicsStrength.value) / 100 });

    });

    physicsQuality?.addEventListener('input', () => {

      applyPhysics({ qualityMul: Number(physicsQuality.value) / 100 });

    });

    togglePhysicsStress?.addEventListener('click', () => {

      const next = !togglePhysicsStress.classList.contains('active');

      applyPhysics({ stressTint: next });

      Toast.show(next ? 'Stress-kleuren aan' : 'Stress-kleuren uit');

    });



    document.getElementById('btn-reset-progress')?.addEventListener('click', () => {

      if (!confirm('Alle game-data op dit apparaat wissen? Sessions, voortgang en instellingen worden verwijderd.')) return;

      Menu.resetAll();

    });

  }



  function refreshSettings() {

    const settings = Storage.readSettings();

    const toggleVibration = document.getElementById('toggle-vibration');

    const toggleSoundSettings = document.getElementById('toggle-sound-settings');

    if (toggleVibration) syncToggle(toggleVibration, settings.vibration !== false, 'Trillen');

    if (toggleSoundSettings) syncToggle(toggleSoundSettings, !!settings.sound, 'Geluid');



    const physics = SideViewGame.getPhysicsSettings();

    const physicsStiffness = document.getElementById('physics-stiffness');

    const physicsStrength = document.getElementById('physics-strength');

    const physicsQuality = document.getElementById('physics-quality');

    const togglePhysicsStress = document.getElementById('toggle-physics-stress');

    const physicsPlayerWeight = document.getElementById('physics-player-weight');

    const physicsBeamMass = document.getElementById('physics-beam-mass');

    const physicsWalkwayMass = document.getElementById('physics-walkway-mass');

    if (physicsPlayerWeight) physicsPlayerWeight.value = String(Math.round(physics.playerWeightKg || 72));

    if (physicsBeamMass) physicsBeamMass.value = String(Math.round((physics.beamMassMul || 1) * 100));

    if (physicsWalkwayMass) physicsWalkwayMass.value = String(Math.round((physics.walkwayMassMul || 1) * 100));

    if (physicsStiffness) physicsStiffness.value = String(Math.round((physics.stiffnessMul || 1) * 100));

    if (physicsStrength) physicsStrength.value = String(Math.round((physics.strengthMul || 1) * 100));

    if (physicsQuality) physicsQuality.value = String(Math.round((physics.qualityMul || 1) * 100));

    if (togglePhysicsStress) syncToggle(togglePhysicsStress, physics.stressTint !== false, 'Stress');

    const playerWeightVal = document.getElementById('physics-player-weight-val');

    const beamMassVal = document.getElementById('physics-beam-mass-val');

    const walkwayMassVal = document.getElementById('physics-walkway-mass-val');

    const stiffnessVal = document.getElementById('physics-stiffness-val');

    const strengthVal = document.getElementById('physics-strength-val');

    const qualityVal = document.getElementById('physics-quality-val');

    if (playerWeightVal) playerWeightVal.textContent = `${Math.round(physics.playerWeightKg || 72)} kg`;

    if (beamMassVal) beamMassVal.textContent = `${Math.round((physics.beamMassMul || 1) * 100)}%`;

    if (walkwayMassVal) walkwayMassVal.textContent = `${Math.round((physics.walkwayMassMul || 1) * 100)}%`;

    if (stiffnessVal) stiffnessVal.textContent = `${Math.round((physics.stiffnessMul || 1) * 100)}%`;

    if (strengthVal) strengthVal.textContent = `${Math.round((physics.strengthMul || 1) * 100)}%`;

    if (qualityVal) qualityVal.textContent = `${Math.round((physics.qualityMul || 1) * 100)}%`;

  }



  return { init, togglePopup, closeAll, refreshSettings };

})();

/* END-MERGE-BLOCK */

