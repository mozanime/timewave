const COLORS = {
  opacity: "#1f77b4",
  width: "#ff7f0e"
}

const COLOR_REGEX = /^rgb\((\d+), (\d+), (\d+)\)$/;

const $ = (selector) => {
  return document.querySelector(selector);
};

const Timewave = {
  init: () => {
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
  build: (animation) => {
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
    Timewave.updateCanvas(animation.id);

    // interaction
    //completeGraphEL.addEventListener("click", () => {
      Timewave.extract(animation.id);
    //});

    Timewave.replay(animation.id);
  },

  // update ----------------------------------------------------
  updateTimeline: (id) => {
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

    const xrate = context.resultTotalTime / width;
    let propertyNames;
    if (!focus) {
      canvasContext.globalAlpha = 1;
      canvasContext.fillStyle = "white";
      canvasContext.fillRect(0, 0, width, height);
      propertyNames = Object.keys(properties);
    } else {
      propertyNames = [focus];
    }
    for (let x = 0; x < width; x++) {
      const currentTime = x * xrate;
      animation.currentTime = currentTime;
      const computedStyle = window.getComputedStyle(target);
      propertyNames.forEach(propertyName => {
        canvasContext.globalAlpha = 1;
        canvasContext.strokeStyle = COLORS[propertyName];
        switch (propertyName) {
          case "color" :
          case "backgroundColor" : {
            canvasContext.strokeStyle = computedStyle[propertyName];
            break;
          }
          case "opacity" : {
            canvasContext.globalAlpha = computedStyle[propertyName];
            break;
          }
        }
        const value =
                Timewave.numberize(propertyName, computedStyle[propertyName]);
        const property = properties[propertyName];
        canvasContext.beginPath();
        canvasContext.moveTo(x, height);
        canvasContext.lineTo(x,
                             height - (value - property.min) * property.yrate);
        canvasContext.stroke();
      });
    }
  },

  updateEasing: (id) => {
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
      const isForwading = Timewave.isForwading(direction, i);
      if (isForwading) {
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
    svgEL.querySelector(".graph").setAttribute("d", d);

    // lines
    let dlines = "";
    for (let i = 0; i < iterationCount + 1; i++) {
      const x = delayx + i * iterationWidth;
      dlines += `M${x},${height} L${x},${0}`;
    }
    svgEL.querySelector(".lines").setAttribute("d", dlines);
  },

  isForwading: (direction, count) => {
    return direction === "normal" ||
           (direction === "alternate" && count % 2 === 0) ||
           (direction === "alternate-reverse" && count % 2 === 1);
  },

  addEasingControlListener: (id, ellipseEL, svgEL, listener) => {
    const mousemoveListener = e => {
      const context = Timewave.contexts[id];
      const widthSVG =
              svgEL.viewBox.baseVal.width * svgEL.parentNode.clientWidth;
      const diff = widthSVG - svgEL.parentNode.clientWidth;
      const mousex = e.layerX - diff;
      let x = mousex < 0 ? 0 : mousex / svgEL.parentNode.clientWidth;
      ellipseEL.setAttribute("cx", x);
      const time = x * context.resultTotalTime;
      listener(time);
    };
    const mouseupListener = e => {
      svgEL.removeEventListener("mousemove", mousemoveListener);
      window.removeEventListener("mouseup", mouseupListener);
    };
    ellipseEL.addEventListener("mousedown", e => {
      svgEL.addEventListener("mousemove", mousemoveListener);
      window.addEventListener("mouseup", mouseupListener);
    });
  },

  setSuitableR: (target, svgEL, rx, ry) => {
    const suitableRx = 1 / svgEL.parentNode.clientWidth * rx;
    const suitableRy = 1 / svgEL.parentNode.clientHeight * ry;
    target.setAttribute("rx", suitableRx);
    target.setAttribute("ry", suitableRy);
  },

  // extract ----------------------------------------------------
  extract: id => {
    Timewave.extractEasing(id);
    Timewave.extractProperties(id);
  },

  extractEasing: id => {
    const target = Timewave.contexts[id].target;
    const animation = target.getAnimations({ id: id })[0];
    const leftEL = $(`#${id} .row.easing .left`);
    $(`#${id} .row.easing .right`).style.height = `${leftEL.clientHeight}px`;
    Timewave.updateEasing(id, animation.effect.timing.easing);
    // control-points for just first iteration
    const svgEL = $(`#${id} .easing svg`);
    const context = Timewave.contexts[id];
    const width =
      1 / context.resultTotalTime * context.totalTime;
    const height = 1;
    const xrate = width / context.totalTime;
    const delayx = animation.effect.timing.delay * xrate;

    const isForwading =
            Timewave.isForwading(animation.effect.timing.direction, 0);

    const controlsEL = svgEL.querySelector(".controls");
    const delayEL = controlsEL.querySelector(".delay");
    const durationEL = controlsEL.querySelector(".duration");
    const rx = Number(delayEL.getAttribute("rx"));
    const ry = Number(delayEL.getAttribute("ry"));
    delayEL.setAttribute("cx", delayx);
    Timewave.setSuitableR(delayEL, svgEL, rx, ry);
    durationEL.setAttribute("cx",
                            delayx + animation.effect.timing.duration * xrate);
    if (isForwading) {
      delayEL.setAttribute("cy", height);
      durationEL.setAttribute("cy", 0);
    } else {
      delayEL.setAttribute("cy", 0);
      durationEL.setAttribute("cy", height);
    }
    Timewave.setSuitableR(durationEL, svgEL, rx, ry);

    // events
    Timewave.addEasingControlListener(id, delayEL, svgEL, time => {
      animation.effect.timing.delay = time;
      const durationx = (time + animation.effect.timing.duration) * xrate;
      durationEL.setAttribute("cx", durationx);
      Timewave.updateTimeline(id);
      Timewave.updateCanvas(id);
      Timewave.updateEasing(id);
    });
    Timewave.addEasingControlListener(id, durationEL, svgEL, time => {
      animation.effect.timing.duration = time - animation.effect.timing.delay;
      Timewave.updateTimeline(id);
      Timewave.updateCanvas(id);
      Timewave.updateEasing(id);
    });
    window.addEventListener("resize", e => {
      const ellipseELs = controlsEL.querySelectorAll("ellipse");
      for (let ellipseEL of ellipseELs) {
        Timewave.setSuitableR(ellipseEL, svgEL, rx, ry);
      };
    });
  },

  extractProperties: id => {
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
          Timewave.extractOpacity(context, animation, svgEL);
          needOverlap = true;
          break;
        }
        case "color":
        case "backgroundColor": {
          Timewave.extractColor(propertyName, context, animation, svgEL);
          needOverlap = true;
          break;
        }
      }
      Timewave.extractProperty(propertyName, context,
                               animation, svgEL, needOverlap);
      propertyEL.parentNode.appendChild(cloned);
    }
    // remove original
    propertyEL.parentNode.removeChild(propertyEL);
  },

  extractProperty: (propertyName, context, animation, svgEL, isOverlap) => {
    const property = context.properties[propertyName];
    const keyframes = animation.effect.getKeyframes();
    const width = svgEL.viewBox.baseVal.width;
    const height = svgEL.viewBox.baseVal.height;
    const yrate = width / (property.max - property.min);
    const xrate = width / (keyframes.length - 1);
    let d = "";
    keyframes.forEach((keyframe, i) => {
      if (keyframe[propertyName]) {
        d += i === 0 ? "M" : "L";
        const value = Timewave.numberize(propertyName, keyframe[propertyName]);
        d += `${i * xrate},${(property.max - value) * yrate} `;
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
    pathEL.addEventListener("mouseenter", (e) => {
      Timewave.updateCanvas(animation.id, propertyName);
    });
  },

  extractOpacity: (context, animation, svgEL) => {
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
    const keyframeWidth = svgEL.viewBox.baseVal.width / (keyframes.length - 1);
    keyframes.forEach((keyframe, i) => {
      if (keyframe["opacity"]) {
        const stopEL =
          addChildNS(linearGradientEL, "http://www.w3.org/2000/svg", "stop");
        stopEL.setAttribute("offset", i * keyframeWidth);
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

  extractColor: (propertyName, context, animation, svgEL) => {
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

    const keyframeWidth = svgEL.viewBox.baseVal.width / (keyframes.length - 1);
    keyframes.forEach((keyframe, i) => {
      if (keyframe[propertyName]) {
        const stopEL =
          addChildNS(linearGradientEL, "http://www.w3.org/2000/svg", "stop");
        stopEL.setAttribute("offset", i * keyframeWidth);
        stopEL.setAttribute("stop-color", keyframe[propertyName]);
        linearGradientEL.appendChild(stopEL);
      }
    });
    const pathEL = svgEL.querySelector("path");
    pathEL.setAttribute("fill", `url(#${gradientID})`);
  },

  // other --------------------------------------------------------------
  replay: id => {
    Timewave.contexts[id].target.getAnimations({ id: id })[0].currentTime = 0;
    Timewave.startObserver(id);
  },

  getDisplayableIterationCount: animation => {
    return animation.effect.timing.iterations === Infinity ||
           animation.effect.timing.iterations > 3
           ? 3 : animation.effect.timing.iterations;
  },

  startObserver: id => {
    // Observe manually in here
    // If the context is chrome,
    // we can use mutableobserver.observe(node, { animations: true });
    const context = Timewave.contexts[id];
    const animation = context.target.getAnimations({ id: id })[0];
    const throbber = $(`#${id} .throbber`);
    const valueELs = {};
    for (let propertyName in context.properties) {
      valueELs[propertyName] = $(`#${id} .${propertyName} .value`);
    }

    const observe = () => {
      const throbberPosition = animation.currentTime / context.resultTotalTime;
      throbber.style.left = `${throbberPosition * 100}%`;
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
