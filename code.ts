const packColor = (r: number, g: number, b: number, a: number = 1): number => {
  const clamp = (val: number, min: number, max: number) => Math.max(min, Math.min(max, val));

  const R = clamp(r, 0, 1) * 255 & 0xFF;
  const G = clamp(g, 0, 1) * 255 & 0xFF;
  const B = clamp(b, 0, 1) * 255 & 0xFF;
  const A = clamp(a, 0, 1) * 255 & 0xFF;

  return (A << 24) | (R << 16) | (G << 8) | B;
}

const getFillColor = (figmaNode: SceneNode): number | undefined => {
  if (!("fills" in figmaNode)) return;

  const fills = figmaNode.fills as Paint[];
  const solid = fills.find(fill => fill.type === "SOLID" && (fill.opacity ?? 1) > 0) as SolidPaint;
  if (!solid) return;

  return packColor(solid.color.r, solid.color.g, solid.color.b, solid.opacity);
}

const getBorderRadiusProps = (figmaNode: SceneNode): Record<string, number> => {
  if (!("topLeftRadius" in figmaNode)) return {};

  const { topLeftRadius, topRightRadius, bottomLeftRadius, bottomRightRadius } = figmaNode as RectangleNode | FrameNode | ComponentNode | InstanceNode;
  if (topLeftRadius === topRightRadius && topRightRadius === bottomLeftRadius && bottomLeftRadius === bottomRightRadius && topLeftRadius > 0) return { borderRadius: topLeftRadius };

  const props: Record<string, number> = {};
  if (topLeftRadius > 0) props.borderTopLeftRadius = topLeftRadius;
  if (topRightRadius > 0) props.borderTopRightRadius = topRightRadius;
  if (bottomLeftRadius > 0) props.borderBottomLeftRadius = bottomLeftRadius;
  if (bottomRightRadius > 0) props.borderBottomRightRadius = bottomRightRadius;

  return props;
}

const getStrokeColor = (figmaNode: SceneNode): number | undefined => {
  if (!("strokes" in figmaNode)) return;

  const strokes = figmaNode.strokes as Paint[];
  const solid = strokes.find(fill => fill.type === "SOLID" && (fill.opacity ?? 1) > 0) as SolidPaint;
  if (!solid) return;

  return packColor(solid.color.r, solid.color.g, solid.color.b, solid.opacity);
}

const getStrokeWeightProps = (figmaNode: SceneNode): Record<string, number> => {
  if (!("strokeLeftWeight" in figmaNode)) return {};

  const { strokeLeftWeight, strokeTopWeight, strokeRightWeight, strokeBottomWeight } = figmaNode as RectangleNode | FrameNode | ComponentNode | InstanceNode;
  if (strokeLeftWeight === strokeTopWeight && strokeTopWeight === strokeRightWeight && strokeRightWeight === strokeBottomWeight && strokeLeftWeight > 0) return { strokeWeight: strokeLeftWeight };

  const props: Record<string, number> = {};
  if (strokeLeftWeight > 0) props.strokeLeftWeight = strokeLeftWeight;
  if (strokeTopWeight > 0) props.strokeTopWeight = strokeTopWeight;
  if (strokeRightWeight > 0) props.strokeRightWeight = strokeRightWeight;
  if (strokeBottomWeight > 0) props.strokeBottomWeight = strokeBottomWeight;

  return props;
}

const getPaddingProps = (figmaNode: SceneNode): Record<string, number> => {
  if (!("paddingLeft" in figmaNode)) return {};

  const { paddingLeft, paddingTop, paddingRight, paddingBottom } = figmaNode as FrameNode | ComponentNode | InstanceNode;
  if (paddingLeft === paddingTop && paddingTop === paddingRight && paddingRight === paddingBottom && paddingLeft > 0) return { padding: paddingLeft };

  const props: Record<string, number> = {};
  if (paddingLeft > 0) props.paddingLeft = paddingLeft;
  if (paddingTop > 0) props.paddingTop = paddingTop;
  if (paddingRight > 0) props.paddingRight = paddingRight;
  if (paddingBottom > 0) props.paddingBottom = paddingBottom;

  return props;
}

const getTextColor = (figmaNode: TextNode): number | undefined => {
  if (!("fills" in figmaNode)) return;

  const fills = figmaNode.fills as Paint[];
  const solid = fills.find(fills => fills.type === "SOLID" && (fills.opacity ?? 1) > 0) as SolidPaint;
  if (!solid) return;

  return packColor(solid.color.r, solid.color.g, solid.color.b, solid.opacity);
}

const getTextFont = (figmaNode: TextNode): [string, number] => {
  if (figmaNode.fontName !== figma.mixed && figmaNode.fontSize !== figma.mixed) {
    return [`${figmaNode.fontName.family}-${figmaNode.fontName.style.replace(/\s/g, "")}.ttf`, figmaNode.fontSize * 0.75];
  } else {
    const segments = figmaNode.getStyledTextSegments(['fontName', 'fontSize']);
    const first = segments[0];
    return [`${first.fontName.family}-${first.fontName.style.replace(/\s/g, "")}.ttf`, first.fontSize * 0.75];
  }
}

const transpile = (object: any, indentLevel = 0): string => {
  const indent = (level: number) => "  ".repeat(level);
  const isArray = Array.isArray;

  const serialize = (value: any, level: number): string => {
    if (value === null || value === undefined) return "nil";
    if (typeof value === "boolean") return value ? "true" : "false";
    if (typeof value === "number") return value.toString();
    if (typeof value === "string") return `"${value.replace(/"/g, '\\"')}"`;
    if (isArray(value)) {
      if (value.length === 0) return "{}";
      const items = value.map(v => serialize(v, level + 1));
      return `{\n${indent(level + 1)}${items.join(`,\n${indent(level + 1)}`)}\n${indent(level)}}`;
    }
    if (typeof value === "object") {
      const entries = Object.entries(value).map(([k, v]) => {
        const key = /^[aZAZ][aZAZ09]*$/.test(k) ? k : `["${k}"]`;
        return `${key} = ${serialize(v, level + 1)}`;
      });
      if (entries.length === 0) return "{}";
      return `{\n${indent(level + 1)}${entries.join(`,\n${indent(level + 1)}`)}\n${indent(level)}}`;
    }
    throw new Error(`Unsupported type: ${typeof value}`);
  }

  return serialize(object, indentLevel);
}

const safelyExport = async (figmaNode: SceneNode): Promise<string> => {
  const updateEffectiveVisibility = (figmaNode: SceneNode): void => {
    figmaNode.visible = true;
    if ("children" in figmaNode) figmaNode.children.forEach(child => updateEffectiveVisibility(child));
  }

  const clone = figmaNode.clone();
  updateEffectiveVisibility(clone);
  clone.x = 0
  clone.y = 0

  const content = (await clone.exportAsync({ format: "SVG_STRING", contentsOnly: true, useAbsoluteBounds: true })).replace(/\n/g, "");

  clone.remove();

  return content;
}

const createNode = async (figmaNode: SceneNode, parentIsFrame: boolean = false, parentIsMainAxisRow: boolean = true, parentStretchItems: boolean = true): Promise<object> => {
  const layoutPositioning = "layoutPositioning" in figmaNode ? figmaNode.layoutPositioning : "AUTO";
  const position = (!parentIsFrame || layoutPositioning === "ABSOLUTE") ? "absolute" : "relative";

  let left;
  let top;

  if (position === "absolute") {
    left = figmaNode.x;
    top = figmaNode.y;
  }

  const layoutMode = "layoutMode" in figmaNode ? figmaNode.layoutMode : "row";
  const flexDirection = layoutMode === "HORIZONTAL" && "row" || layoutMode === "VERTICAL" && "column";

  const layoutWrap = "layoutWrap" in figmaNode ? figmaNode.layoutWrap : "NO_WRAP";
  const flexWrap = layoutWrap === "NO_WRAP" && "nowrap" || layoutWrap === "WRAP" && "wrap";

  const primaryAxisAlignItems = "primaryAxisAlignItems" in figmaNode ? figmaNode.primaryAxisAlignItems : "MIN";
  const justifyContent = primaryAxisAlignItems === "MIN" && "flex-start" || primaryAxisAlignItems === "MAX" && "flex-end" || primaryAxisAlignItems === "CENTER" && "center" || primaryAxisAlignItems === "SPACE_BETWEEN" && "space-between";

  const counterAxisAlignItems = "counterAxisAlignItems" in figmaNode ? figmaNode.counterAxisAlignItems : "MIN";
  const alignItems = counterAxisAlignItems === "MIN" && "stretch" || counterAxisAlignItems === "MAX" && "flex-end" || counterAxisAlignItems === "CENTER" && "center";

  const gap = "itemSpacing" in figmaNode ? figmaNode.itemSpacing : undefined;

  const layoutSizingHorizontal = "layoutSizingHorizontal" in figmaNode ? figmaNode.layoutSizingHorizontal : "FIXED";
  const width = layoutSizingHorizontal === "FIXED" && figmaNode.width || layoutSizingHorizontal === "FILL" && (!parentIsMainAxisRow && parentStretchItems && "auto" || "100%") || layoutSizingHorizontal === "HUG" && "fit-content";

  const layoutSizingVertical = "layoutSizingVertical" in figmaNode ? figmaNode.layoutSizingVertical : "FIXED";
  const height = layoutSizingVertical === "FIXED" && figmaNode.height || layoutSizingVertical === "FILL" && (parentIsMainAxisRow && parentStretchItems && "auto" || "100%") || layoutSizingVertical === "HUG" && "fit-content";

  const fillColor = getFillColor(figmaNode);

  const strokeColor = getStrokeColor(figmaNode);
  const strokeWeight = getStrokeWeightProps(figmaNode);
  const borderRadius = getBorderRadiusProps(figmaNode);
  const padding = getPaddingProps(figmaNode);

  if (["FRAME", "GROUP", "COMPONENT", "INSTANCE"].includes(figmaNode.type) && "children" in figmaNode && figmaNode.children.every(child => child.type === "VECTOR")) {
    return {
      constructor: "Layta.Image",
      id: figmaNode.name,
      visible: figmaNode.visible,
      position,
      left,
      top,
      width,
      height,
      foregroundColor: fillColor,
      material: `Layta.svgCreate(${figmaNode.width}, ${figmaNode.height}, '${(await safelyExport(figmaNode)).replace(/\n/g, "")}')`
    };
  }
  else if (figmaNode.type === "FRAME") {
    const node = {
      constructor: "Layta.Node",
      children: [] as any[],
      id: figmaNode.name,
      visible: figmaNode.visible,
      position,
      left,
      top,
      flexDirection,
      flexWrap,
      justifyContent,
      alignItems,
      gap,
      width,
      height,
      fillColor,
      strokeColor,
      ...strokeWeight,
      ...borderRadius,
      ...padding
    };

    for (const figmaChild of figmaNode.children) {
      try {
        node.children.push(await createNode(figmaChild, true, flexDirection === "row", true));
      } catch (e) {
        console.log(e);
      }
    };

    return node;
  }
  else if (figmaNode.type === "GROUP" || figmaNode.type === "COMPONENT") {
    const node = {
      constructor: "Layta.Node",
      children: [] as any[],
      id: figmaNode.name,
      visible: figmaNode.visible,
      position,
      left,
      top,
      width,
      height,
    };

    for (const figmaChild of figmaNode.children) {
      try {
        node.children.push(await createNode(figmaChild, false, true, true));
      } catch (e) {
        console.log(e);
      }
    };

    return node;
  }
  else if (figmaNode.type === "INSTANCE") {
    const node = {
      constructor: "Layta.Node",
      children: [] as any[],
      id: figmaNode.name,
      visible: figmaNode.visible,
      position,
      left,
      top,
      flexDirection,
      flexWrap,
      justifyContent,
      alignItems,
      gap,
      width,
      height,
      backgroundColor: fillColor,
      strokeColor,
      ...strokeWeight,
      ...borderRadius
    };

    for (const figmaChild of figmaNode.children) {
      try {
        node.children.push(await createNode(figmaChild, false, flexDirection === "row", true));
      } catch (e) {
        console.log(e);
      }
    };

    return node;
  }
  else if (figmaNode.type === "RECTANGLE") {
    return {
      constructor: "Layta.Node",
      children: [] as any[],
      id: figmaNode.name,
      visible: figmaNode.visible,
      position,
      left,
      top,
      width,
      height,
      backgroundColor: fillColor,
      strokeColor,
      ...strokeWeight,
      ...borderRadius,
    };
  }
  else if (figmaNode.type === "TEXT") {
    const [fontName, fontSize] = getTextFont(figmaNode);
    return {
      constructor: "Layta.Text",
      id: figmaNode.name,
      visible: figmaNode.visible,
      position,
      left,
      top,
      text: figmaNode.characters,
      width,
      height,
      foregroundColor: getTextColor(figmaNode),
      font: `Layta.dxCreateFont("${fontName}", ${fontSize}, false, "cleartype_natural") or "default"`,
      wordWrap: figmaNode.textAutoResize === "HEIGHT"
    };
  }
  else {
    throw new Error("Unsupported type: " + figmaNode.type);
  }
};

const buildTree = (node: any, level: number = 0): string => {
  const indent = '  '.repeat(level);

  const { constructor, children } = node;

  const props = Object.entries(node).filter(([key]) => key !== "constructor" && key !== "children").map(([key, value]: [any, any]) => `${key} = ${(key === "font" || key == "material") && value.replace(/^'(.*)'$/, "$1") || transpile(value)}`).join(", ");
  if (!children || children.length === 0) return `${indent}${constructor}({${props}})`;

  const childrenStr = children.map((child: any) => buildTree(child, level + 1)).join(`,\n`);
  return `${indent}${constructor}(\n${'  '.repeat(level + 1)}{${props}},\n${childrenStr}\n${indent})`;
}

(async () => {
  const { selection } = figma.currentPage;

  if (selection.length > 0) {
    try {
      const tree = await createNode(selection[0]);

      figma.showUI(__html__, { width: 600, height: 800, title: "Layta Figma Plugin" });
      figma.ui.postMessage(`loadstring(exports.layta:\u0069\u006d\u0070\u006f\u0072\u0074())()\n\nlocal ui = ${buildTree(tree)}\n\nui:setParent(Layta.tree)`);
    } catch (e) {
      console.log(e);
    }
  }
})();