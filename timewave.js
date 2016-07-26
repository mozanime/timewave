const COLORS = {
  opacity: "#1f77b4",
  width: "#ff7f0e"
};

const COLOR_REGEX = /^rgb\((\d+), (\d+), (\d+)\)$/;
const BEZIER_REGEX =
  /^cubic-bezier\((-?[\d.]+),\s?(-?[\d.]+),\s?(-?[\d.]+),\s?(-?[\d.]+)\)/;

const EASING_CONTROL_BAR_WIDTH = 10;
const EASING_CONTROL_POINT_R = 5;

const $ = (selector) => {
  return document.querySelector(selector);
};

const Timewave = {
  init: () => {
    // new canvas to create cached image
    Timewave.canvas = $("#cloneables canvas").cloneNode();
    Timewave.contexts = {};
    Timewave.buildAll();
  },

  // build -------------------------------------------------
  buildAll: () => {
    const animations = document.getAnimations();
    let idcount = 1;
    animations.forEach(animation => {
      animation.id = `animation-${idcount}`;
      Timewave.build(animation);
    });
  },

  build: animation => {
    const animationEL = $("#cloneables .animation").cloneNode(true);
    animationEL.id = animation.id;
    $("#animations").appendChild(animationEL);

    // animation values --------------------------
    const target = animation.effect.target;
    let targetName = target.tagName.toLowerCase();
    if (target.id) {
      targetName += "#" + target.id;
    } else {
      for (let i = 0; i < target.classList.length; i++) {
        targetName += "." + target.classList.item(i);
      }
    }
    const keyframes = animation.effect.getKeyframes();
    const properties = {};
    keyframes.forEach(keyframe => {
      for (let propertyName in keyframe) {
        if (propertyName === "computedOffset" ||
            propertyName === "offset" ||
            propertyName === "easing")
        {
          continue;
        }
        let property = properties[propertyName];
        if (!property) {
          property = {};
          properties[propertyName] = property;
        }
        const value = Timewave.numberize(propertyName, keyframe[propertyName]);
        if (typeof property.min === "undefined") {
          property.min = value;
          property.max = value;
          property.count = 1;
        } else {
          property.min = Math.min(property.min, value);
          property.max = Math.max(property.max, value);
          property.count += 1;
        }
      }
    });

    const duration = animation.effect.timing.duration;
    const delay = animation.effect.timing.delay;
    const iterationCount = Timewave.getDisplayableIterationCount(animation);
    const easing = animation.effect.timing.easing;
    const totalTime = (duration * iterationCount) + delay;
    // ----------------------------------------------

    const $$ = selector => {
      return animationEL.querySelector(selector);
    };
    $$(".target").textContent = targetName;
    const canvas = $$("canvas");

    for (let propertyName in properties) {
      const property = properties[propertyName];
      const distance = property.max - property.min;
      const height = canvas.height;
      property.yrate = distance === 0 ? 0 : height / distance;
    }

    const left = $$(".left");
    $$(".right").style.height = `${left.clientHeight}px`;

    const zeroLabel = $$(".timeline .ruler label:first-child");
    {
      const extraLabels =
        animationEL.querySelectorAll(".timeline .ruler label:nth-child(n+2)");
      for (let label of extraLabels) {
        label.parentNode.removeChild(label);
      }
    }
    const context = {};
    context.target = target;
    context.properties = properties;
    context.resultTotalTime = totalTime * 1.1;
    context.totalTime = totalTime;
    Timewave.contexts[animation.id] = context;

    Timewave.updateTimeline(animation.id);
    Timewave.buildPropertiesImage(animation.id);
    Timewave.updateCanvas(animation.id);

    Timewave.buildEasing(animation.id);
    Timewave.buildProperties(animation.id);

    const easingEL = $$(".row.easing");
    easingEL.dataset.height = easingEL.querySelector(".left").clientHeight;
    const keyframesEL = $$(".row.keyframes");
    keyframesEL.dataset.height =
      keyframesEL.querySelector(".left").clientHeight;
    easingEL.style.display = "none";
    keyframesEL.style.display = "none";
    for (let propertyEL of animationEL.querySelectorAll(".row.property")) {
      propertyEL.dataset.height =
        propertyEL.querySelector(".left").clientHeight;
      propertyEL.style.display = "none";
    }

    Timewave.replay(animation.id);

    Timewave.addDisplayControls(animation.id);
  },

  buildPropertiesImage: id => {
    const context = Timewave.contexts[id];
    const properties = context.properties;
    Object.keys(properties).forEach(propertyName => {
      Timewave.buildPropertyImage(id, propertyName);
    });
  },

  buildPropertyImage: (id, propertyName) => {
    const context = Timewave.contexts[id];
    const property = context.properties[propertyName];
    const target = context.target;
    const animation = target.getAnimations({ id: id })[0];
    const canvas = Timewave.canvas;
    const canvasContext = canvas.getContext("2d");
    const width = canvas.width;
    const height = canvas.height;
    const xrate = context.resultTotalTime / width;
    canvasContext.clearRect(0, 0, width, height);
    for (let x = 0; x < width; x++) {
      const currentTime = x * xrate;
      animation.currentTime = currentTime;
      const computedStyle = window.getComputedStyle(target);
      switch (propertyName) {
        case "color" :
        case "backgroundColor" : {
          canvasContext.strokeStyle = computedStyle[propertyName];
          break;
        }
        case "opacity" : {
          canvasContext.globalAlpha = computedStyle[propertyName];
        }
        default : {
          canvasContext.strokeStyle = COLORS[propertyName];
        }
      }
      const value =
        Timewave.numberize(propertyName, computedStyle[propertyName]);
      canvasContext.beginPath();
      canvasContext.moveTo(x, height);
      canvasContext.lineTo(x, height - (value - property.min) * property.yrate);
      canvasContext.stroke();
    }
    if (!property.image) {
      property.image = new Image();
    }
    property.image.src = canvas.toDataURL("image/png");
  },

  buildEasing: id => {
    const target = Timewave.contexts[id].target;
    const animation = target.getAnimations({ id: id })[0];
    const leftEL = $(`#${id} .row.easing .left`);
    $(`#${id} .row.easing .right`).style.height = `${leftEL.clientHeight}px`;
    Timewave.updateEasing(id, animation.effect.timing.easing);
    Timewave.addEasingControls(id);
  },

  buildProperties: id => {
    const context = Timewave.contexts[id];
    const properties = context.properties;
    const animation = context.target.getAnimations({ id: id })[0];

    const propertyEL = $(`#${id} .row.property`);
    const keyframes = animation.effect.getKeyframes();
    for (let propertyName in properties) {
      const cloned = propertyEL.cloneNode(true);
      cloned.classList.add(propertyName);
      const propertyNameEL = cloned.querySelector(".name");
      propertyNameEL.textContent = Timewave.idlToProperty(propertyName);
      const leftEL = propertyEL.querySelector(".left");
      cloned.querySelector(".right").style.height = `${leftEL.clientHeight}px`;

      const svgEL = cloned.querySelector("svg");
      let needOverlap = false;
      switch (propertyName) {
        case "opacity": {
          Timewave.buildOpacity(context, animation, svgEL);
          needOverlap = true;
          break;
        }
        case "color":
        case "backgroundColor": {
          Timewave.buildColor(propertyName, context, animation, svgEL);
          needOverlap = true;
          break;
        }
      }
      Timewave.buildProperty(propertyName, context,
                               animation, svgEL, needOverlap);
      propertyEL.parentNode.appendChild(cloned);
    }
    // remove original
    propertyEL.parentNode.removeChild(propertyEL);
  },

  buildProperty: (propertyName, context, animation, svgEL, isOverlap) => {
    const property = context.properties[propertyName];
    const keyframes = animation.effect.getKeyframes();
    const width = svgEL.viewBox.baseVal.width;
    const height = svgEL.viewBox.baseVal.height;
    const yrate = height / (property.max - property.min);
    let d = "";
    keyframes.forEach((keyframe, i) => {
      if (keyframe[propertyName]) {
        d += i === 0 ? "M" : "L";
        const value = Timewave.numberize(propertyName, keyframe[propertyName]);
        d += `${keyframe["computedOffset"]},${(property.max - value) * yrate} `;
      }
    });
    d += `L${width},${height} L0,${height}`;

    const pathEL = svgEL.querySelector("path");
    pathEL.setAttribute("d", d);
    if (isOverlap) {
      pathEL.setAttribute("stroke", "#ddd");
    } else {
      pathEL.setAttribute("fill", `${COLORS[propertyName]}88`);
      pathEL.setAttribute("stroke", COLORS[propertyName]);
    }

    Timewave.addKeyframeControls(propertyName, context, animation, svgEL);

    pathEL.addEventListener("mouseenter", (e) => {
      Timewave.updateCanvas(animation.id, propertyName);
    });
  },

  buildOpacity: (context, animation, svgEL) => {
    const keyframes = animation.effect.getKeyframes();
    const defsEL = addChildNS(svgEL, "http://www.w3.org/2000/svg", "defs");
    const linearGradientEL = addChildNS(defsEL, "http://www.w3.org/2000/svg",
                                        "linearGradient");
    linearGradientEL.setAttribute("x1", "0%");
    linearGradientEL.setAttribute("y1", "0%");
    linearGradientEL.setAttribute("x2", "100%");
    linearGradientEL.setAttribute("y2", "0%");
    const gradientID = `${animation.id}-opacity`;
    linearGradientEL.setAttribute("id", gradientID);

    const color = COLORS["opacity"];
    keyframes.forEach(keyframe => {
      if (keyframe["opacity"]) {
        const stopEL =
          addChildNS(linearGradientEL, "http://www.w3.org/2000/svg", "stop");
        stopEL.setAttribute("offset", keyframe["computedOffset"]);
        stopEL.setAttribute("stop-color", color);
        const value = Timewave.numberize("opacity", keyframe["opacity"]);
        stopEL.setAttribute("stop-opacity", value);
        linearGradientEL.appendChild(stopEL);
      }
    });
    const pathEL = svgEL.querySelector("path");
    pathEL.setAttribute("fill", `url(#${gradientID})`);
    pathEL.setAttribute("stroke", color);
  },

  buildColor: (propertyName, context, animation, svgEL) => {
    const keyframes = animation.effect.getKeyframes();
    const defsEL = addChildNS(svgEL, "http://www.w3.org/2000/svg", "defs");
    const linearGradientEL = addChildNS(defsEL, "http://www.w3.org/2000/svg",
                                        "linearGradient");
    linearGradientEL.setAttribute("x1", "0%");
    linearGradientEL.setAttribute("y1", "0%");
    linearGradientEL.setAttribute("x2", "100%");
    linearGradientEL.setAttribute("y2", "0%");
    const gradientID = `${animation.id}-${propertyName}`;
    linearGradientEL.setAttribute("id", gradientID);

    keyframes.forEach(keyframe => {
      if (keyframe[propertyName]) {
        const stopEL =
          addChildNS(linearGradientEL, "http://www.w3.org/2000/svg", "stop");
        stopEL.setAttribute("offset", keyframe["computedOffset"]);
        stopEL.setAttribute("stop-color", keyframe[propertyName]);
        linearGradientEL.appendChild(stopEL);
      }
    });
    const pathEL = svgEL.querySelector("path");
    pathEL.setAttribute("fill", `url(#${gradientID})`);
  },

  // update ----------------------------------------------------
  updateTimeline: id => {
    const timelineEL = $(`#${id} .timeline`);
    const context = Timewave.contexts[id];
    const animation = context.target.getAnimations({ id: id })[0];
    const zeroLabel = timelineEL.querySelector(".ruler label:first-child");
    const extraLabels =
      timelineEL.querySelectorAll(".ruler label:nth-child(n+2)");
    for (let label of extraLabels) {
      label.parentNode.removeChild(label);
    }
    const delay = animation.effect.timing.delay;
    if (delay !== 0) {
      const label = zeroLabel.cloneNode();
      label.textContent = Math.round(delay);
      zeroLabel.parentNode.appendChild(label);
      label.style.left = `${ delay / context.resultTotalTime * 100 }%`;
    }
    const duration = animation.effect.timing.duration;
    const iterationCount = Timewave.getDisplayableIterationCount(animation);
    for (let i = 1; i < iterationCount + 1; i++) {
      const value = delay + i * duration;
      const label = zeroLabel.cloneNode();
      label.textContent = Math.round(value);
      zeroLabel.parentNode.appendChild(label);
      label.style.left = `${ value / context.resultTotalTime * 100 }%`;
    }
  },

  updateCanvas: (id, focus) => {
    const context = Timewave.contexts[id];
    const properties = context.properties;
    const target = context.target;
    const animation = target.getAnimations({ id: id })[0];
    const canvas = $(`#${id} canvas`);
    const canvasContext = canvas.getContext("2d");
    const height = canvas.height;
    const width = canvas.width;

    const propertyNames = focus ? [focus] : Object.keys(properties);
    canvasContext.globalAlpha = 1;
    canvasContext.fillStyle = "white";
    canvasContext.fillRect(0, 0, width, height);

    (paint = index => {
      if (index >= propertyNames.length) {
        return;
      }
      const propertyName = propertyNames[index];
      const property = context.properties[propertyName];
      if (property.image.complete) {
        canvasContext.drawImage(property.image, 0, 0);
        paint(index + 1);
      } else {
        property.image.onload = () => {
          canvasContext.drawImage(property.image, 0, 0);
          paint(index + 1);
        };
      }
    })(0);
  },

  updateEasing: id => {
    const svgEL = $(`#${id} .easing svg`);
    const context = Timewave.contexts[id];
    const animation = context.target.getAnimations({ id: id })[0];
    const delay = animation.effect.timing.delay;
    const iterationCount = Timewave.getDisplayableIterationCount(animation);
    const direction = animation.effect.timing.direction;
    const duration = animation.effect.timing.duration;

    const width =
      1 / context.resultTotalTime * context.totalTime;
    const height = 1;
    const xrate = width / context.totalTime;
    const delayx = delay * xrate;
    const iterationWidth = duration * xrate;
    const p =
      Timewave.getControlPoints(animation.effect.timing.easing,
                                iterationWidth, height);
    let d = "";
    for (let i = 0; i < iterationCount; i++) {
      const x = delayx + i * iterationWidth;
      const nextx = x + iterationWidth;
      const isForwarding = Timewave.isForwarding(direction, i);
      if (isForwarding) {
        d += `M${x},${height} `
          + `C${x + p.cx1},${p.cy1} `
          + `${x + p.cx2},${p.cy2} `
          + `${nextx},0 `;
      } else {
        d += `M${x},0 `
          + `C${x + iterationWidth - p.cx2},${p.cy2} `
          + `${x + iterationWidth - p.cx1},${p.cy1} `
          + `${nextx},${height} `;
      }
      d += `L${nextx},${height} L${x},${height}`;
    }

    // fill-mode
    const isBackwards = animation.effect.timing.fill === "both" ||
                        animation.effect.timing.fill === "backwards";
    if (isBackwards && !Timewave.isForwarding(direction, 0) && delay !== 0) {
      d += `M0,1 L0,0 L${delayx},0 L${delayx},1 L0,1`;
    }
    const isForwards = animation.effect.timing.fill === "both" ||
                       animation.effect.timing.fill === "forwards";
    if (isForwards &&
        iterationCount === animation.effect.timing.iterations &&
        Timewave.isForwarding(direction, iterationCount - 1)) {
      const sx = delayx + iterationWidth * iterationCount;
      d += `M${sx},1 L${sx},0 L1,0 L1,1 L${sx},1 `;
    }
    svgEL.querySelector(".graph").setAttribute("d", d);

    // lines
    let dlines = "";
    for (let i = 0; i < iterationCount + 1; i++) {
      const x = delayx + i * iterationWidth;
      dlines += `M${x},${height} L${x},${0}`;
    }
    svgEL.querySelector(".lines").setAttribute("d", dlines);
  },

  // controls ------------------------------------
  addEasingControls: id => {
    const context = Timewave.contexts[id];
    const animation = context.target.getAnimations({ id: id })[0];
    const svgEL = $(`#${id} .easing svg`);
    const adjustorEL = svgEL.querySelector(".duration-control");
    const durationEL = svgEL.querySelector(".duration");
    const cp1EL = svgEL.querySelector(".cp1");
    const cp2EL = svgEL.querySelector(".cp2");
    const cp1LineEL = svgEL.querySelector(".cp1-line");
    const cp2LineEL = svgEL.querySelector(".cp2-line");

    const updateEasingControlUI = () => {
      const width = 1 / context.resultTotalTime * context.totalTime;
      const height = 1;
      const xrate = width / context.totalTime;
      const delayx = animation.effect.timing.delay * xrate;
      const durationx = animation.effect.timing.duration * xrate;
      const p =
        Timewave.getControlPoints(animation.effect.timing.easing,
                                  durationx, height);
      let cx1, cy1, cx2, cy2, x1, y1, x2, y2;
      if (Timewave.isForwarding(animation.effect.timing.direction, 0)) {
        cx1 = delayx + p.cx1;
        cy1 = p.cy1;
        cx2 = delayx + p.cx2;
        cy2 = p.cy2;
        x1 = delayx;
        y1 = 1;
        x2 = delayx + durationx;
        y2 = 0;
      } else {
        cx1 = delayx + durationx - p.cx1;
        cy1 = p.cy1;
        cx2 = delayx + durationx - p.cx2;
        cy2 = p.cy2;
        x1 = delayx + durationx;
        y1 = 1;
        x2 = delayx;
        y2 = 0;
      }
      cp1EL.setAttribute("cx", cx1);
      cp1EL.setAttribute("cy", cy1);
      cp2EL.setAttribute("cx", cx2);
      cp2EL.setAttribute("cy", cy2);
      Timewave.setPixelR(cp1EL, svgEL, EASING_CONTROL_POINT_R);
      Timewave.setPixelR(cp2EL, svgEL, EASING_CONTROL_POINT_R);
      cp1LineEL.setAttribute("x1", x1);
      cp1LineEL.setAttribute("y1", y1);
      cp1LineEL.setAttribute("x2", cx1);
      cp1LineEL.setAttribute("y2", cy1);
      cp2LineEL.setAttribute("x1", x2);
      cp2LineEL.setAttribute("y1", y2);
      cp2LineEL.setAttribute("x2", cx2);
      cp2LineEL.setAttribute("y2", cy2);
    };

    {
      const width = 1 / context.resultTotalTime * context.totalTime;
      const height = 1;
      const xrate = width / context.totalTime;
      const delayx = animation.effect.timing.delay * xrate;
      const durationx = animation.effect.timing.duration * xrate;
      const iterationCount = Timewave.getDisplayableIterationCount(animation);
      durationEL.setAttribute("x", delayx + durationx * iterationCount);
      Timewave.setPixelWidth(durationEL, svgEL, EASING_CONTROL_BAR_WIDTH);
      Timewave.adjustEasingControlBar(adjustorEL,
                                      Number(durationEL.getAttribute("width")));
      Timewave.setPixelR(cp1EL, svgEL, EASING_CONTROL_POINT_R);
      Timewave.setPixelR(cp2EL, svgEL, EASING_CONTROL_POINT_R);
      updateEasingControlUI();
    }

    const update = () => {
      Timewave.updateTimeline(id);
      Timewave.buildPropertiesImage(id);
      Timewave.updateCanvas(id);
      Timewave.updateEasing(id);
    };

    const toTimewavePosition = e => {
      const context = Timewave.contexts[id];
      const widthSVG =
        svgEL.viewBox.baseVal.width * svgEL.parentNode.clientWidth;
      const heightSVG =
        svgEL.viewBox.baseVal.height * svgEL.parentNode.clientHeight;
      const diffx = widthSVG - svgEL.parentNode.clientWidth;
      const diffy = heightSVG - svgEL.parentNode.clientHeight;
      const mousex = e.layerX - diffx;
      const mousey = e.layerY - diffy;
      const x = mousex / svgEL.parentNode.clientWidth;
      const y = mousey / svgEL.parentNode.clientHeight;
      const time = x * context.resultTotalTime;
      return { x: x, y: y, time: time };
    };

    // delay --------
    const delayOriginalContext = {};
    const delayMousemoveListener = e => {
      const tPosition = toTimewavePosition(e);
      const diffTime =
        tPosition.time - delayOriginalContext.tPosition.time;
      animation.effect.timing.delay = delayOriginalContext.delay + diffTime;
      const diffX =
        tPosition.x - delayOriginalContext.tPosition.x;
      durationEL.setAttribute("x", delayOriginalContext.durationX + diffX);
      const cp1X = delayOriginalContext.cp1X + diffX;
      const cp2X = delayOriginalContext.cp2X + diffX;
      cp1EL.setAttribute("cx", cp1X);
      cp2EL.setAttribute("cx", cp2X);
      cp1LineEL.setAttribute("x1", delayOriginalContext.cp1LineX + diffX);
      cp1LineEL.setAttribute("x2", cp1X);
      cp2LineEL.setAttribute("x1", delayOriginalContext.cp2LineX + diffX);
      cp2LineEL.setAttribute("x2", cp2X);
      Timewave.updateTimeline(id);
      Timewave.updateEasing(id);
    };
    const delayMouseupListener = e => {
      svgEL.removeEventListener("mousemove", delayMousemoveListener);
      window.removeEventListener("mouseup", delayMouseupListener);
      svgEL.setAttribute("cursor", delayOriginalContext.cursor);
      update();
    };
    svgEL.addEventListener("mousedown", e => {
      if (e.target === durationEL || e.target === cp1EL || e.target === cp2EL) {
        return;
      }
      delayOriginalContext.tPosition = toTimewavePosition(e);
      delayOriginalContext.durationX = Number(durationEL.getAttribute("x"));
      delayOriginalContext.cp1X = Number(cp1EL.getAttribute("cx"));
      delayOriginalContext.cp2X = Number(cp2EL.getAttribute("cx"));
      delayOriginalContext.cp1LineX = Number(cp1LineEL.getAttribute("x1"));
      delayOriginalContext.cp2LineX = Number(cp2LineEL.getAttribute("x1"));
      delayOriginalContext.delay = animation.effect.timing.delay;
      delayOriginalContext.cursor = svgEL.getAttribute("cursor");
      svgEL.setAttribute("cursor", "grabbing");
      svgEL.addEventListener("mousemove", delayMousemoveListener);
      window.addEventListener("mouseup", delayMouseupListener);
    });

    // duration --------
    const durationOriginalContext = {};
    const durationMousemoveListener = e => {
      const tPosition = toTimewavePosition(e);
      const diffTime = tPosition.time - durationOriginalContext.tPosition.time;
      const iterationCount = Timewave.getDisplayableIterationCount(animation);
      animation.effect.timing.duration =
        durationOriginalContext.duration + diffTime / iterationCount;
      const diffX = tPosition.x - durationOriginalContext.tPosition.x;
      durationEL.setAttribute("x", durationOriginalContext.durationX + diffX);
      updateEasingControlUI();
      Timewave.updateTimeline(id);
      Timewave.updateEasing(id);
    };
    const durationMouseupListener = e => {
      svgEL.removeEventListener("mousemove", durationMousemoveListener);
      window.removeEventListener("mouseup", durationMouseupListener);
      svgEL.setAttribute("cursor", durationOriginalContext.cursor);
      update();
    };
    durationEL.addEventListener("mousedown", e => {
      svgEL.addEventListener("mousemove", durationMousemoveListener);
      window.addEventListener("mouseup", durationMouseupListener);
      durationOriginalContext.cursor = svgEL.getAttribute("cursor");
      durationOriginalContext.tPosition = toTimewavePosition(e);
      durationOriginalContext.duration = animation.effect.timing.duration;
      durationOriginalContext.durationX = Number(durationEL.getAttribute("x"));
      svgEL.setAttribute("cursor", durationEL.getAttribute("cursor"));
    });

    // easing -----------------------------
    const easingOriginalContext = {};
    const updateEasing = () => {
      const width = 1 / context.resultTotalTime * context.totalTime;
      const xrate = width / context.totalTime;
      const durationx = animation.effect.timing.duration * xrate;
      let cp1x, cp1y, cp2x, cp2y;
      if (Timewave.isForwarding(animation.effect.timing.direction, 0)) {
        cp1x = (Number(cp1LineEL.getAttribute("x2"))
                - Number(cp1LineEL.getAttribute("x1"))) / durationx;
        cp1y = 1 - Number(cp1EL.getAttribute("cy"));
        cp2x = (Number(cp2LineEL.getAttribute("x1"))
                - Number(cp2LineEL.getAttribute("x2"))) / durationx;
        cp2y = 1 - Number(cp2EL.getAttribute("cy"));
      } else {
        cp1x = (Number(cp1LineEL.getAttribute("x1"))
                - Number(cp1LineEL.getAttribute("x2"))) / durationx;
        cp1y = 1 - Number(cp1EL.getAttribute("cy"));
        cp2x = (Number(cp2LineEL.getAttribute("x2"))
                - Number(cp2LineEL.getAttribute("x1"))) / durationx;
        cp2y = 1 - Number(cp2EL.getAttribute("cy"));
      }
      animation.effect.timing.easing =
        `cubic-bezier(${cp1x}, ${cp1y}, ${cp2x}, ${cp2y})`;
    };
    const easingMousemoveListener = e => {
      const tPosition = toTimewavePosition(e);
      const diffX = tPosition.x - easingOriginalContext.tPosition.x;
      const diffY = tPosition.y - easingOriginalContext.tPosition.y;
      const cx = easingOriginalContext.x + diffX;
      const cy = easingOriginalContext.y + diffY;
      easingOriginalContext.target.setAttribute("cx", cx);
      easingOriginalContext.target.setAttribute("cy", cy);
      easingOriginalContext.line.setAttribute("x2", cx);
      easingOriginalContext.line.setAttribute("y2", cy);
      updateEasing();
      Timewave.updateEasing(id);
    };
    const easingMouseupListener = e => {
      svgEL.removeEventListener("mousemove", easingMousemoveListener);
      window.removeEventListener("mouseup", easingMouseupListener);
      svgEL.setAttribute("cursor", easingOriginalContext.cursor);
      updateEasing();
      update();
    };
    const easingMousedonwListener = e => {
      svgEL.addEventListener("mousemove", easingMousemoveListener);
      window.addEventListener("mouseup", easingMouseupListener);
      const target = e.target;
      easingOriginalContext.target = target;
      easingOriginalContext.line = target === cp1EL ? cp1LineEL : cp2LineEL;
      easingOriginalContext.cursor = svgEL.getAttribute("cursor");
      easingOriginalContext.tPosition = toTimewavePosition(e);
      easingOriginalContext.x = Number(target.getAttribute("cx"));
      easingOriginalContext.y = Number(target.getAttribute("cy"));
      svgEL.setAttribute("cursor", target.getAttribute("cursor"));
    };
    cp1EL.addEventListener("mousedown", easingMousedonwListener);
    cp2EL.addEventListener("mousedown", easingMousedonwListener);

    // resize ----------------
    window.addEventListener("resize", e => {
      Timewave.setPixelWidth(durationEL, svgEL, EASING_CONTROL_BAR_WIDTH);
      Timewave.adjustEasingControlBar(adjustorEL,
                                      Number(durationEL.getAttribute("width")));
      Timewave.setPixelR(cp1EL, svgEL, EASING_CONTROL_POINT_R);
      Timewave.setPixelR(cp2EL, svgEL, EASING_CONTROL_POINT_R);
    });
  },

  addKeyframeControls: (propertyName, context, animation, svgEL) => {
    const property = context.properties[propertyName];
    const keyframes = animation.effect.getKeyframes();
    const width = svgEL.viewBox.baseVal.width;
    const height = svgEL.viewBox.baseVal.height;
    const yrate = width / (property.max - property.min);
    const xrate = width / (keyframes.length - 1);
    keyframes.forEach(keyframe => {
      if (keyframe[propertyName]) {
        const value = Timewave.numberize(propertyName, keyframe[propertyName]);
      }
    });
  },

  addDisplayControls: id => {
    const animationEL = $(`#${id}`);
    const delay = 0;
    const duration = 50;
    animationEL.querySelector(".row.result").addEventListener("click", () => {
      const isVisibled =
        animationEL.querySelector(".row.easing").style.display !== "none";
      Timewave.setRowPaneVisible(animationEL.querySelector(".row.easing"),
                                 !isVisibled, duration, 0);
      Timewave.setRowPaneVisible(animationEL.querySelector(".row.keyframes"),
                                 !isVisibled, duration, delay);
      const propertyELs = animationEL.querySelectorAll(".row.property");
      for (let i = 0; i < propertyELs.length; i++) {
        const propertyEL = propertyELs[i];
        Timewave.setRowPaneVisible(propertyEL, !isVisibled,
                                   duration, delay * (i + 2));
      }
    });
  },

  setRowPaneVisible: (rowEL, isVisible, duration, delay) => {
    const height = rowEL.dataset.height;
    const rightEL = rowEL.querySelector(".right");
    const leftEL = rowEL.querySelector(".left");
    let start, end;
    if (isVisible) {
      rowEL.style.display = "block";
      start = "0px";
      end = `${height}px`;
    } else {
      end = "0px";
      start = `${height}px`;
    }
    const animation = leftEL.animate({ height: [`${start}`, `${end}`] },
                                     { delay: delay, duration:
                                       duration, fill: "both" });
    rightEL.animate({ height: [`${start}`, `${end}`] },
                    { delay: delay, duration: duration, fill: "both" });
    if (!isVisible) {
      animation.finished.then(() => {
        rowEL.style.display = "none";
      });
    }
  },

  // other --------------------------------------------------------------
  replay: id => {
    Timewave.contexts[id].target.getAnimations({ id: id })[0].currentTime = 0;
    Timewave.startObserver(id);
  },

  isForwarding: (direction, count) => {
    return direction === "normal" ||
           (direction === "alternate" && count % 2 === 0) ||
           (direction === "alternate-reverse" && count % 2 === 1);
  },

  setSuitableR: (target, svgEL, rx, ry) => {
    const suitableRx = 1 / svgEL.parentNode.clientWidth * rx;
    const suitableRy = 1 / svgEL.parentNode.clientHeight * ry;
    target.setAttribute("rx", suitableRx);
    target.setAttribute("ry", suitableRy);
  },

  setPixelR: (target, svgEL, r) => {
    const suitableRx = 1 / svgEL.parentNode.clientWidth * r;
    const suitableRy = 1 / svgEL.parentNode.clientHeight * r;
    target.setAttribute("rx", suitableRx);
    target.setAttribute("ry", suitableRy);
  },

  setPixelWidth: (target, svgEL, width) => {
    const suitableWidth = 1 / svgEL.parentNode.clientWidth * width;
    target.setAttribute("width", suitableWidth);
  },

  adjustEasingControlBar: (target, width) => {
    target.setAttribute("transform", `translate(${-width/2}, 0)`);
  },

  getDisplayableIterationCount: animation => {
    return animation.effect.timing.iterations === Infinity
           ? 3 : animation.effect.timing.iterations;
  },

  startObserver: id => {
    // Observe manually in here
    // If the context is chrome,
    // we can use mutableobserver.observe(node, { animations: true });
    const context = Timewave.contexts[id];
    const animation = context.target.getAnimations({ id: id })[0];
    const scrubber = $(`#${id} .scrubber`);
    const valueELs = {};
    for (let propertyName in context.properties) {
      valueELs[propertyName] = $(`#${id} .${propertyName} .value`);
    }
    const observe = () => {
      const scrubberPosition = animation.currentTime / context.resultTotalTime;
      scrubber.style.left = `${scrubberPosition * 100}%`;
      const computedStyle = window.getComputedStyle(context.target);
      for (let propertyName in context.properties) {
        const value = computedStyle[propertyName];
        const valueEL = valueELs[propertyName];
        if (valueEL) {
          valueEL.textContent = value;
        }
      }
      if (animation.currentTime < context.totalTime) {
        window.requestAnimationFrame(observe);
      }
    };
    observe();
  },

  getControlPoints: (easing, maxx, maxy) => {
    switch (easing) {
      case "linear" : {
        return Timewave.cubicBezier(0, 0, 1, 1, maxx, maxy);
      }
      case "ease" : {
        return Timewave.cubicBezier(0.25, 1, 0.25, 1, maxx, maxy);
      }
      case "ease-in" : {
        return Timewave.cubicBezier(0.42, 0, 1, 1, maxx, maxy);
      }
      case "ease-in-out" : {
        return Timewave.cubicBezier(0.48, 0, 0.58, 1, maxx, maxy);
      }
      case "ease-out" : {
        return Timewave.cubicBezier(0, 0, 0.58, 1, maxx, maxy);
      }
      default : {
        let cps = BEZIER_REGEX.exec(easing);
        return Timewave.cubicBezier(Number(cps[1]), Number(cps[2]),
                                    Number(cps[3]), Number(cps[4]), maxx, maxy);
      }
    }
  },

  cubicBezier: (x1, y1, x2, y2, maxx, maxy) => {
    return { cx1: maxx*x1, cy1: (1-y1)*maxy, cx2: maxx*x2, cy2: (1-y2)*maxy };
  },

  numberize: (propertyName, value) => {
    switch (propertyName) {
      case "color" :
      case "backgroundColor" : {
        let rgb = COLOR_REGEX.exec(value);
        if (rgb === null) {
          $("#cloneables").style.color = value;
          rgb = COLOR_REGEX.exec(getComputedStyle($("#cloneables")).color);
        }
        const r = Number(rgb[1]);
        const g = Number(rgb[2]);
        const b = Number(rgb[3]);
        const hsl = Timewave.rgbToHSL(r, g, b);
        return hsl.h + hsl.s + hsl.l;
      }
      default : {
        break;
      }
    }
    return Number(value.replace(/[A-Za-z]+/, ""));
  },

  idlToProperty: idl => {
    if (idl == "cssFloat") {
      return "float";
    }
    return idl.replace(/([A-Z])/, (str, group) => {
      return `-${group.toLowerCase()}`;
    });
  },

  rgbToHSL: (r, g, b) => {
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const hsl = { "h": 0, "s": 0, "l": (max + min) / 2 };
    if (max != min) {
      if (max == r) hsl.h = 60 * (g - b) / (max-min);
      if (max == g) hsl.h = 60 * (b - r) / (max-min) + 120;
      if (max == b) hsl.h = 60 * (r - g) / (max-min) + 240;
      if (hsl.l <= 127){
        hsl.s = (max - min) / (max + min);
      }else{
        hsl.s = (max - min) / (510 - max - min);
      }
    }
    if (hsl.h < 0){
      hsl.h = hsl.h + 360;
    }
    hsl.s =  hsl.s * 100;
    hsl.l =  (hsl.l / 255) * 100;
    return hsl;
  },

  getMinMax: values => {
    let max = values[0];
    let min = max;
    for (let i = 1; i < values.length; i++) {
      max = Math.max(max, values[i]);
      min = Math.min(min, values[i]);
    }
    return { max: max, min: min };
  }
};

const addChild = (parent, tag, classes, id) => {
  const element = document.createElement(tag);
  _addChild(parent, element, classes, id);
  return element;
};

const addChildNS = (parent, ns, tag, classes, id) => {
  const element = document.createElementNS(ns, tag);
  _addChild(parent, element, classes, id);
  return element;
};

const _addChild = (parent, element, classes, id) => {
  if (id) {
    element.id = id;
  }
  if (classes) {
    if (typeof classes === "string") {
      element.classList.add(classes);
    } else {
      classes.forEach(clazz => {
        element.classList.add(clazz);
      });
    }
  }
  parent.appendChild(element);
};

document.addEventListener("DOMContentLoaded", e => {
  Timewave.init();
});
