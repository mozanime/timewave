const COLORS = {
  opacity: "#1f77b4",
  width: "#ff7f0e"
}

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
        const value = Timewave.numberize(keyframe[propertyName]);
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
    const easing = animation.effect.timing.easing;
    const totalTime = duration + delay;
    // ----------------------------------------------

    const $$ = selector => {
      return animationEL.querySelector(selector);
    };
    $$(".target").textContent = targetName;
    const canvas = $$("canvas");
    const propertyEL = $$(".left .property");

    for (let propertyName in properties) {
      const property = properties[propertyName];
      const distance = property.max - property.min;
      const height = canvas.height;
      property.yrate = distance === 0 ? 0 : height / distance;

      const cloned = propertyEL.cloneNode(true);
      cloned.classList.add(propertyName);
      const propertyNameEL = cloned.querySelector(".name");
      propertyNameEL.textContent = propertyName;
      propertyEL.parentNode.appendChild(cloned);
    }
    propertyEL.parentNode.removeChild(propertyEL);

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
    const resultTotalTime = totalTime * 1.1;
    const rulerPerLabel = totalTime / 2;
    for (let i = 1; i < 3; i++) {
      const label = zeroLabel.cloneNode();
      const value = rulerPerLabel * i;
      label.textContent = value;
      const length = label.textContent.length;
      zeroLabel.parentNode.appendChild(label);
      label.style.left = `${ value / resultTotalTime * 100 }%`;
    }

    const context = {};
    context.target = target;
    context.properties = properties;
    context.resultTotalTime = resultTotalTime;
    context.totalTime = totalTime;
    Timewave.contexts[animation.id] = context;

    Timewave.updateCanvas(animation.id);

    // interaction
    //completeGraphEL.addEventListener("click", () => {
      Timewave.extract(animation.id);
    //});

    Timewave.replay(animation.id);
  },

  replay: id => {
    Timewave.contexts[id].target.getAnimations({ id: id })[0].currentTime = 0;
    Timewave.startObserver(id);
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

  // update ----------------------------------------------------
  updateCanvas: id => {
    const context = Timewave.contexts[id];
    const properties = context.properties;
    const target = context.target;
    const animation = target.getAnimations({ id: id })[0];
    const canvas = $(`#${id} canvas`);
    const canvasContext = canvas.getContext("2d");

    const height = canvas.height;
    const width = canvas.width;

    const totalTime = context.resultTotalTime;
    const xrate = totalTime / width;
    canvasContext.fillStyle = "white";
    canvasContext.fillRect(0, 0, width, height);
    canvasContext.globalAlpha = 0.7;
    const propertyNames = Object.keys(properties);
    for (let x = 0; x < width; x++) {
      const currentTime = x * xrate;
      animation.currentTime = currentTime;
      const computedStyle = window.getComputedStyle(target);
      propertyNames.forEach(propertyName => {
        canvasContext.strokeStyle = COLORS[propertyName];
        const value = Timewave.numberize(computedStyle[propertyName]);
        const property = properties[propertyName];
        const minvalue = property.min;
        const rate = property.yrate;
        canvasContext.beginPath();
        canvasContext.moveTo(x, height);
        canvasContext.lineTo(x, height - (value - minvalue) * rate);
        canvasContext.stroke();
      });
    }
    propertyNames.forEach(propertyName => {
      const propertyEL =
        document.querySelector(`#${id} .property.${propertyName}`);
      propertyEL.style.color = COLORS[propertyName];
    });
  },
  updateEasing: (id, easing) => {
    const target = Timewave.contexts[id].target;
    const animation = target.getAnimations({ id: id })[0];
    document.querySelector(".easing .value").textContent = easing;
    animation.effect.timing.easing = easing;
    Timewave.updateCanvas(id);
    Timewave.updateEasingGraph(id, easing);
    Timewave.replay(id);
  },
  updateEasingGraph: (id, easing) => {
    const svgEL = $(`#${id} .easing svg`);
    const context = Timewave.contexts[id];
    const maxx =
      svgEL.viewBox.baseVal.width / context.resultTotalTime * context.totalTime;
    const maxy = svgEL.viewBox.baseVal.height;
    const p = Timewave.getControlPoints(easing, maxx, maxy);
    const pathEL = svgEL.querySelector("path");
    const d = `M0, ${maxy} C${p.cx1},${p.cy1} ${p.cx2},${p.cy2} `
               + `${maxx},0 L${maxx},${maxy}`;
    pathEL.setAttribute("d", d);
  },

  // extract ----------------------------------------------------
  extract: id => {
    Timewave.extractEasing(id);
    Timewave.extractProperties(id);
  },
  extractEasing: id => {
    const target = Timewave.contexts[id].target;
    const animation = target.getAnimations({ id: id })[0];
    const propertyValueEL = $(`#${id} .easing .value`);
    propertyValueEL.textContent = animation.effect.timing.easing;

    const selectionELs =
      document.querySelectorAll(`#${id} .easing-selector .selection`);

    for (let selectionEL of selectionELs) {
      const easing = animation.effect.timing.easing;
      if (easing === selectionEL.dataset.easing) {
        selectionEL.classList.add("selected");
        Timewave.updateEasingGraph(id, easing);
      } else {
        selectionEL.classList.remove("selected");
      }
      selectionEL.addEventListener("click", e => {
        Timewave.selectedEasing(animation.id, e.target.dataset.easing);
      });
    };
  },
  selectedEasing: (id, easing) => {
    const selectionELs =
      document.querySelectorAll(`#${id} .easing-selector .selection`);
    for (let selectionEL of selectionELs) {
      if (selectionEL.dataset.easing !== easing) {
        selectionEL.classList.remove("selected");
      } else {
        selectionEL.classList.add("selected");
      }
    };
    Timewave.updateEasing(id, easing);
  },

  extractProperties: id => {
    const context = Timewave.contexts[id];
    const properties = context.properties;
    const animation = context.target.getAnimations({ id: id })[0];
    const propertyEL = $(`#${id} .row.property`);
    const keyframes = animation.effect.getKeyframes();
    for (let propertyName in properties) {
      const property = properties[propertyName];
      const cloned = propertyEL.cloneNode(true);
      cloned.classList.add(propertyName);
      const propertyNameEL = cloned.querySelector(".name");
      propertyNameEL.style.color = COLORS[propertyName];
      propertyNameEL.textContent = propertyName;
      const svgEL = cloned.querySelector("svg");
      const maxx = svgEL.viewBox.baseVal.width;
      const maxy = svgEL.viewBox.baseVal.height;
      const minvalue = property.min;
      const yrate = maxy / (property.max - property.min);
      const xrate = maxx / (keyframes.length - 1);

      let d;
      keyframes.forEach((keyframe, i) => {
        if (keyframe[propertyName]) {
          if (i === 0) {
            d = "M";
          } else {
            d += "L";
          }
          const value = Timewave.numberize(keyframe[propertyName]);
          const x = i * xrate;
          const y = (property.max - value) * yrate;
          d += `${x},${y} `;
        }
      });
      d += `L${maxx},${maxy} L0,${maxy}`;

      const pathEL = svgEL.querySelector("path");
      pathEL.setAttribute("d", d);
      pathEL.style.fill = COLORS[propertyName];
      propertyEL.parentNode.appendChild(cloned);
    }

    // remove original
    propertyEL.parentNode.removeChild(propertyEL);

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
  numberize: value => {
    return Number(value.replace(/[A-Za-z]+/, ""));
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
