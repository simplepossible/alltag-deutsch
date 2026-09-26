const KEY = "alltag-deutsch-v1";

export function blankProfile() {
  return {
    level: null,
    xp: 0,
    ease: false,
    sessions: [],
    phraseStats: {},
    recentSceneIds: [],
    active: null,
    queued: null,
    lastResult: null,
    screen: "welcome",
    placementStep: 0,
    placementSelf: null,
    placementChecks: [],
    placementPick: null,
    confirmReset: false,
  };
}

export function loadProfile() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return blankProfile();
    return { ...blankProfile(), ...JSON.parse(raw) };
  } catch {
    return blankProfile();
  }
}

export function saveProfile(profile) {
  localStorage.setItem(KEY, JSON.stringify(profile));
}
