function userInputKey(e) {
  let key = String.fromCharCode(e.which);
  switch (key) {
    case 'H':
      setCMV("TRACKING_MODE", "Upper-Body");
      setTrackingModeSelect("Upper-Body");
      break;
    case 'F':
      setCMV("TRACKING_MODE", "Face-Only");
      setTrackingModeSelect("Face-Only");
      break;
    default:
      break;
  }
}

onKeyUpHook(userInputKey);
