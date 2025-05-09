// global clock variable
let clock = new THREE.Clock();
clock.start();

// config
let Tvrmsbspn = THREE_VRM.VRMExpressionPresetName;
let Tvrmshbn = THREE_VRM.VRMHumanBoneName;
let currentVrm = undefined;
let defaultXYZ = undefined;

// initialize / reinitialize VRM
function loadVRM(vrmurl) {
  loadVRMModel(
    vrmurl,
    function (vrm) {
      if (currentVrm) {
        removeFromScene(currentVrm.scene);
        THREE_VRM.VRMUtils.deepDispose(currentVrm.scene);
      }
      let hips = vrm.humanoid.getNormalizedBoneNode(Tvrmshbn.Hips);
      defaultXYZ = [hips.position.x, hips.position.y, hips.position.z];
      if (vrm.meta.metaVersion === "1") {
        hips.rotation.y = Math.PI;
      }
      currentVrm = vrm;
      addToScene(vrm.scene);
      let head = currentVrm.humanoid.getNormalizedBoneNode(Tvrmshbn.Head);
      let foot = currentVrm.humanoid.getNormalizedBoneNode(Tvrmshbn.LeftFoot);
      let pos = {
        x: head.up.x + head.position.x,
        y: head.up.y + head.position.y - foot.position.y,
        z: head.up.z + head.position.z,
      };
      resetCameraPos(pos);
      resetVRMMood();
      createMoodLayout();
      console.log("vrm model loaded");
      console.log(currentVrm);
    },
    function () {
      if (vrmurl != getCMV("MODEL")) {
        loadVRM(getCMV("MODEL"));
      } else if (vrmurl != getCMV("DEFAULT_MODEL")) {
        setCMV("MODEL", getCMV("DEFAULT_MODEL"));
        loadVRM(getCMV("DEFAULT_MODEL"));
      }
    }
  );
  setMood(getCMV("DEFAULT_MOOD"));
  setLogAPI(getSavedConfigString());
}

function getMetaVersion() {
  if (currentVrm) {
    return currentVrm.meta.metaVersion;
  }
  return null;
}

// initialize the control
function initialize() {
  initConfig();

  // html canvas for drawing debug view
  createLayout();

  // init core
  initCore();

  // load vrm model
  loadVRM(getCMV("MODEL"));

  setInterval(checkHealth, 1000 * getCMV("HEALTH_RATE"));
  console.log("controller initialized");
}

// 変化のあるボーン以外を処理スキップする
function isDifferentArray(a, b, eps = 1e-4) {
  if (!a || !b) return true;
  for (let i = 0; i < a.length; i++) {
    if (Math.abs(a[i] - b[i]) > eps) return true;
  }
  return false;
}

// 表情の更新頻度を下げる
let lastExpressionUpdate = 0; // ← グローバルに定義
let expressionUpdateInterval = 1000 / 10; // ← 100ms間隔（10fps）

function updateVRMMovement(keys) {
  if (currentVrm) {
    expressionUpdateInterval = 1000 / getCMV("EXPRESSION_UPDATE_PER_SEC");
    let skip_expression_update = (Date.now() - lastExpressionUpdate < expressionUpdateInterval);
    let Ch = currentVrm.humanoid;
    if (!skip_expression_update) {
      lastExpressionUpdate = Date.now();
      let Cbsp = currentVrm.expressionManager;
      Object.keys(keys["b"]).forEach(function (key) {
        Cbsp.setValue(key, keys["b"][key]);
      });
    }
    Object.keys(keys["r"]).forEach(function (key) {
      let tnode = Ch.getNormalizedBoneNode(key);
      if (tnode) {
        let crotate = tnode.rotation;
        let trotate = keys["r"][key];
        const current = [crotate.x, crotate.y, crotate.z, crotate.w];
        if (isDifferentArray(current, trotate, 1e-3)) {
          crotate.set(...trotate);
        }
      }
    });
    Object.keys(keys["p"]).forEach(function (key) {
      let tnode = Ch.getNormalizedBoneNode(key);
      if (tnode) {
        let cposition = tnode.position;
        let tposition = keys["p"][key];
        const current = [cposition.x, cposition.y, cposition.z];
        if (isDifferentArray(current, tposition, 1e-3)) {
          cposition.set(...tposition);
        }
      }
    });
    Object.keys(keys["e"]).forEach(function (key) {
      let tnode = Ch.getNormalizedBoneNode(key);
      if (tnode) {
        let ceuler = tnode.rotation;
        let teuler = keys["e"][key];
        const current = [ceuler.x, ceuler.y, ceuler.z];
        const target = [teuler.x, teuler.y, teuler.z];
        if (isDifferentArray(current, target, 1e-3)) {
          ceuler.copy(teuler);
        }
      }
    });
    if (getCMV("TRACKING_MODE") != "Upper-Body") {
      setPoseMode(currentVrm, getCMV("TRACKING_MODE"));
    }
  }
}

function updatePosition(keys) {
  if (currentVrm && defaultXYZ) {
    let Ch = currentVrm.humanoid;
    let hips = Ch.getNormalizedBoneNode(Tvrmshbn.Hips).position;
    // position update
    hips.x =
      defaultXYZ[0] -
      keys["x"] * getCMV("POSITION_X_RATIO") * getCMV("POSITION_TRACKING");
    hips.y =
      defaultXYZ[1] -
      keys["y"] * getCMV("POSITION_Y_RATIO") * getCMV("POSITION_TRACKING");
    hips.z =
      defaultXYZ[2] +
      keys["z"] * getCMV("POSITION_Z_RATIO") * getCMV("POSITION_TRACKING");
    // breath offset update
    let bos =
      (getCMV("BREATH_STRENGTH") / 100) *
      Math.sin(clock.elapsedTime * Math.PI * getCMV("BREATH_FREQUENCY"));
    if (isNaN(bos)) {
      bos = 0.0;
    }
    hips.y += bos;
  }
}

function updateMood() {
  if (mood != oldmood) {
    console.log(mood, oldmood);
    let Cbsp = currentVrm.expressionManager;
    if (oldmood != "auto") {
      Cbsp.setValue(moodMap[oldmood], 0);
    } else {
      Cbsp.setValue(Tvrmsbspn.Angry, 0);
      Cbsp.setValue(Tvrmsbspn.Sad, 0);
      Cbsp.setValue(Tvrmsbspn.Happy, 0);
      Cbsp.setValue(Tvrmsbspn.Ee, 0);
    }
    if (mood != "auto") {
      Cbsp.setValue(moodMap[mood], 1);
    }
    oldmood = mood;
  }
}

function updateInfo() {
  let minfo = getVRMMovement();
  updateVRMMovement(minfo);
  updatePosition(minfo);
  updateMood();
}

function exportRotate() {
  let vrmRotate = {};
  if (currentVrm) {
    for (let area of Object.values(Tvrmshbn)) {
      let areaNode = currentVrm.humanoid.getNormalizedBoneNode(area);
      if (areaNode) {
        let hasNonZeros = false;
        let areaRotate = [];
        for (let j of "xyz") {
          areaRotate.push(areaNode.rotation[j]);
          if (areaNode.rotation[j] != 0) {
            hasNonZeros = true;
          }
        }
        if (hasNonZeros) {
          vrmRotate[area] = areaRotate;
        }
      }
    }
  } else {
    console.log("VRM not loaded");
  }
  return vrmRotate;
}

// Mood
let defaultMoodList = [
  "auto",
  "angry",
  "sorrow",
  "fun",
  "joy",
  "surprised",
  "relaxed",
  "neutral",
];
let moodMap = {
  auto: "AUTO_MOOD_DETECTION",
  angry: Tvrmsbspn.Angry,
  sorrow: Tvrmsbspn.Sad,
  fun: Tvrmsbspn.Happy,
  surprised: "Surprised",
  relaxed: Tvrmsbspn.Relaxed,
  neutral: Tvrmsbspn.Neutral,
};
let mood = "auto";
let oldmood = "auto";

function getAllMoods() {
  let validmoods = [];
  Object.keys(moodMap).forEach(function (key) {
    if (defaultMoodList.includes(key)) {
      if (getCMV("MOOD_" + key.toUpperCase())) {
        validmoods.push(key);
      }
    }
  });
  Object.keys(moodMap).forEach(function (key) {
    if (!defaultMoodList.includes(key)) {
      validmoods.push(key);
    }
  });
  return validmoods;
}

function setMood(newmood) {
  mood = newmood;
  setCMV("MOOD", newmood);
}

function exportExpression() {
  let vrmExpression = {};
  if (currentVrm) {
    let Cbsp = currentVrm.expressionManager;
    for (let expression of Object.values(Tvrmsbspn)) {
      if (Cbsp.getValue(expression) && Cbsp.getValue(expression) != 0) {
        vrmExpression[expression] = Cbsp.getValue(expression);
      }
    }
  } else {
    console.log("VRM not loaded");
  }
  return vrmExpression;
}

function updateVideoControl() {
  // set for 3PD integration validation
  if (true) {
    if (getCMV("RESET_CAMERA")) {
      setCMV("RESET_CAMERA", false);
      setCameraCallBack();
    }
    clearDebugCvs();
    if (getCMV("DEBUG_IMAGE")) {
      drawImage(getCameraFrame());
    }
    if (getCMV("DEBUG_LANDMARK")) {
      drawLandmark(getPoI());
    }
  }
}

function updateVRMScene() {
  currentVrm.update(clock.getDelta());
  updateInfo();
  drawScene();
}

function updateEffect() {
  let foregroundeffect = document.getElementById("foregroundeffect");
  foregroundeffect
    .getContext("2d")
    .clearRect(0, 0, foregroundeffect.width, foregroundeffect.height);
  let backgroundeffect = document.getElementById("backgroundeffect");
  backgroundeffect
    .getContext("2d")
    .clearRect(0, 0, backgroundeffect.width, backgroundeffect.height);
  let alleffects = getAllEffects();
  Object.keys(alleffects).forEach(function (key) {
    let effectlist = alleffects[key];
    for (let effectitem of effectlist) {
      let itemcheck = document.getElementById(effectitem["key"] + "_box");
      if (itemcheck.checked && effectitem["updateEffect"]) {
        effectitem["updateEffect"](clock.getDelta());
      }
    }
  });
}

function updateLog() {
  let allLog = getHealthLog();
  let coreLog = getCoreLog();
  Object.keys(coreLog).forEach(function (key) {
    allLog[key] = coreLog[key];
  });
  printLog(allLog);
}

// the main visualization loop
async function viLoop() {
  if (currentVrm && checkImage()) {
    addCMV("VI_LOOP_COUNTER", 1);

    updateVideoControl();
    updateVRMScene();
    updateEffect();
    updateLog();

    setTimeout(function () {
      requestAnimationFrame(viLoop);
    }, getCMV("DYNA_VI_DURATION"));
  } else {
    setTimeout(function () {
      requestAnimationFrame(viLoop);
    }, getCMV("MAX_VI_DURATION"));
  }
  if (getCMV("GOOD_TO_GO")) {
    if (getCMV("LOADING_SCENE")) {
      correctMeta();
      hideLoadbox();
      console.log("ml & visual loops validated");
    }
  }
}

// mood check
let noMoods = [];

function resetVRMMood() {
  noMoods = [];
  Object.keys(moodMap).forEach(function (i) {
    if (!defaultMoodList.includes(i)) {
      delete moodMap[i];
    }
  });
  if (currentVrm) {
    let defaultMoodLength = Object.keys(moodMap).length;
    for (tmood of currentVrm.expressionManager.blinkExpressionNames) {
      noMoods.push(tmood);
    }
    for (tmood of currentVrm.expressionManager.lookAtExpressionNames) {
      noMoods.push(tmood);
    }
    for (tmood of currentVrm.expressionManager.mouthExpressionNames) {
      noMoods.push(tmood);
    }
    let unknownMood = currentVrm.expressionManager._expressionMap;
    Object.keys(unknownMood).forEach(function (newmood) {
      if (!noMoods.includes(newmood)) {
        let newmoodid = Object.keys(moodMap).length - defaultMoodLength;
        if (!Object.values(moodMap).includes(newmood)) {
          if (newmoodid < getCMV("MOOD_EXTRA_LIMIT")) {
            moodMap[newmoodid.toString()] = newmood;
          }
        }
      }
    });
  }
}

function checkVRMMood(tmoodk) {
  if (tmoodk == "auto") {
    return true;
  } else if (noMoods.includes(tmoodk)) {
    return false;
  } else if (currentVrm) {
    let tmoodv = moodMap[tmoodk];
    if (currentVrm.expressionManager.getExpressionTrackName(tmoodv)) {
      return true;
    } else if (currentVrm.expressionManager.getExpressionTrackName(tmoodk)) {
      return true;
    } else {
      noMoods.push(tmoodk);
      return false;
    }
  } else {
    return false;
  }
}

// integration check
async function checkIntegrate() {
  createCameraLayout();
  setCameraCallBack();
  drawLoading();
  setNewMeta();
  initEffect();
  postImage();
  init_rimlight();
  requestAnimationFrame(viLoop);
  console.log("ml & visual loops initialized");
}

// check VRM model
function checkVRMModel() {
  if (currentVrm) {
    return true;
  } else {
    return false;
  }
}

// initialization loop
function initLoop() {
  if (window.mobileCheck() && !getCMV("TEST_MOBILE_ENTRY")) {
    drawMobile();
  } else if (
    window.browserCheck() == "Safari" &&
    !getCMV("TEST_SAFARI_ENTRY")
  ) {
    drawSafari();
  } else {
    drawLoading();
    if (checkVRMModel() && checkMLModel() && checkImage()) {
      console.log("start integration validation");
      checkIntegrate();
    } else {
      requestAnimationFrame(initLoop);
    }
  }
}
