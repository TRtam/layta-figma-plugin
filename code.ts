const packColor = (r: number, g: number, b: number, a: number = 1): number => {
  const clamp = (val: number, min: number, max: number) => Math.max(min, Math.min(max, val));

  const R = clamp(r, 0, 1) * 255 & 0xFF;
  const G = clamp(g, 0, 1) * 255 & 0xFF;
  const B = clamp(b, 0, 1) * 255 & 0xFF;
  const A = clamp(a, 0, 1) * 255 & 0xFF;

  return (A << 24) | (R << 16) | (G << 8) | B;
}

const getBackgroundColor = (figmaNode: SceneNode): number | undefined => {
  if (!("fills" in figmaNode)) return;

  const fills = figmaNode.fills as Paint[];
  const solid = fills.find(fill => fill.type === "SOLID" && (fill.opacity ?? 1) > 0) as SolidPaint;
  if (!solid) return;

  return packColor(solid.color.r, solid.color.g, solid.color.b, solid.opacity);
}

const getBorderRadiusProps = (figmaNode: RectangleNode | FrameNode | InstanceNode): Record<string, number> => {
  const { topLeftRadius, topRightRadius, bottomLeftRadius, bottomRightRadius } = figmaNode;
  if (topLeftRadius === topRightRadius && topRightRadius === bottomLeftRadius && bottomLeftRadius === bottomRightRadius && topLeftRadius > 0) return { borderRadius: topLeftRadius };

  const props: Record<string, number> = {};
  if (topLeftRadius > 0) props.borderTopLeftRadius = topLeftRadius;
  if (topRightRadius > 0) props.borderTopRightRadius = topRightRadius;
  if (bottomLeftRadius > 0) props.borderBottomLeftRadius = bottomLeftRadius;
  if (bottomRightRadius > 0) props.borderBottomRightRadius = bottomRightRadius;

  return props;
}

const getStrokeColor = (figmaNode: RectangleNode | FrameNode | InstanceNode): number | undefined => {
  if (!("strokes" in figmaNode)) return;

  const strokes = figmaNode.strokes as Paint[];
  const solid = strokes.find(fill => fill.type === "SOLID" && (fill.opacity ?? 1) > 0) as SolidPaint;
  if (!solid) return;

  return packColor(solid.color.r, solid.color.g, solid.color.b, solid.opacity);
}

const getStrokeWeightProps = (figmaNode: RectangleNode | FrameNode | InstanceNode): Record<string, number> => {
  const { strokeLeftWeight, strokeTopWeight, strokeRightWeight, strokeBottomWeight } = figmaNode;
  if (strokeLeftWeight === strokeTopWeight && strokeTopWeight === strokeRightWeight && strokeRightWeight === strokeBottomWeight && strokeLeftWeight > 0) return { strokeWeight: strokeLeftWeight };

  const props: Record<string, number> = {};
  if (strokeLeftWeight > 0) props.strokeLeftWeight = strokeLeftWeight;
  if (strokeTopWeight > 0) props.strokeTopWeight = strokeTopWeight;
  if (strokeRightWeight > 0) props.strokeRightWeight = strokeRightWeight;
  if (strokeBottomWeight > 0) props.strokeBottomWeight = strokeBottomWeight;

  return props;
}

const getPaddingProps = (figmaNode: FrameNode): Record<string, number> => {
  const { paddingLeft, paddingTop, paddingRight, paddingBottom } = figmaNode;
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

const createNode = async (figmaNode: SceneNode, parentIsMainAxisRow: boolean = true, parentStretchItems: boolean = true): Promise<object> => {
  if (["FRAME", "GROUP", "COMPONENT", "INSTANCE"].includes(figmaNode.type) && "children" in figmaNode && figmaNode.children.every(child => child.type === "VECTOR")) {
    const layoutSizingHorizontal = "layoutSizingHorizontal" in figmaNode ? figmaNode.layoutSizingHorizontal : "FIXED";
    const width = layoutSizingHorizontal === "FIXED" && figmaNode.width || layoutSizingHorizontal === "FILL" && (!parentIsMainAxisRow && parentStretchItems && "auto" || "100%") || layoutSizingHorizontal === "HUG" && "fit-content";

    const layoutSizingVertical = "layoutSizingVertical" in figmaNode ? figmaNode.layoutSizingVertical : "FIXED";
    const height = layoutSizingVertical === "FIXED" && figmaNode.height || layoutSizingVertical === "FILL" && (parentIsMainAxisRow && parentStretchItems && "auto" || "100%") || layoutSizingVertical === "HUG" && "fit-content";

    const image = {
      constructor: "Layta.Image",
      id: figmaNode.name,
      visible: figmaNode.visible,
      width,
      height,
      foregroundColor: getBackgroundColor(figmaNode),
      material: `svgCreate(${figmaNode.width}, ${figmaNode.height}, '${(await safelyExport(figmaNode)).replace(/\n/g, "")}')`
    }

    return image;
  }
  else if (figmaNode.type === "FRAME") {
    const layoutMode = figmaNode.layoutMode;
    const flexDirection = layoutMode === "HORIZONTAL" && "row" || layoutMode === "VERTICAL" && "column";

    const layoutWrap = figmaNode.layoutWrap;
    const flexWrap = layoutWrap === "NO_WRAP" && "nowrap" || layoutWrap === "WRAP" && "wrap";

    const primaryAxisAlignItems = figmaNode.primaryAxisAlignItems;
    const justifyContent = primaryAxisAlignItems === "MIN" && "flex-start" || primaryAxisAlignItems === "MAX" && "flex-end" || primaryAxisAlignItems === "CENTER" && "center" || primaryAxisAlignItems === "SPACE_BETWEEN" && "space-between";

    const counterAxisAlignItems = figmaNode.counterAxisAlignItems;
    const alignItems = counterAxisAlignItems === "MIN" && "stretch" || counterAxisAlignItems === "MAX" && "flex-end" || counterAxisAlignItems === "CENTER" && "center";

    const gap = figmaNode.itemSpacing;

    const layoutSizingHorizontal = figmaNode.layoutSizingHorizontal;
    const width = layoutSizingHorizontal === "FIXED" && figmaNode.width || layoutSizingHorizontal === "FILL" && (!parentIsMainAxisRow && parentStretchItems && "auto" || "100%") || layoutSizingHorizontal === "HUG" && "fit-content";

    const layoutSizingVertical = figmaNode.layoutSizingVertical;
    const height = layoutSizingVertical === "FIXED" && figmaNode.height || layoutSizingVertical === "FILL" && (parentIsMainAxisRow && parentStretchItems && "auto" || "100%") || layoutSizingVertical === "HUG" && "fit-content";

    const node = {
      constructor: "Layta.Node",
      children: [] as any[],
      id: figmaNode.name,
      visible: figmaNode.visible,
      flexDirection,
      flexWrap,
      justifyContent,
      alignItems,
      gap,
      width,
      height,
      backgroundColor: getBackgroundColor(figmaNode),
      strokeColor: getStrokeColor(figmaNode),
      ...getStrokeWeightProps(figmaNode),
      ...getBorderRadiusProps(figmaNode),
      ...getPaddingProps(figmaNode)
    };

    for (const figmaChild of figmaNode.children) {
      try {
        node.children.push(await createNode(figmaChild, flexDirection === "row", true));
      } catch (e) {
        console.log(e);
      }
    };

    return node;
  }
  else if (figmaNode.type === "GROUP" || figmaNode.type === "COMPONENT") {
    const layoutSizingHorizontal = figmaNode.layoutSizingHorizontal;
    const width = layoutSizingHorizontal === "FIXED" && figmaNode.width || layoutSizingHorizontal === "FILL" && (!parentIsMainAxisRow && parentStretchItems && "auto" || "100%") || layoutSizingHorizontal === "HUG" && "fit-content";

    const layoutSizingVertical = figmaNode.layoutSizingVertical;
    const height = layoutSizingVertical === "FIXED" && figmaNode.height || layoutSizingVertical === "FILL" && (parentIsMainAxisRow && parentStretchItems && "auto" || "100%") || layoutSizingVertical === "HUG" && "fit-content";

    const node = {
      constructor: "Layta.Node",
      children: [] as any[],
      id: figmaNode.name,
      visible: figmaNode.visible,
      width,
      height,
    };

    for (const figmaChild of figmaNode.children) {
      try {
        node.children.push(await createNode(figmaChild, true, true));
      } catch (e) {
        console.log(e);
      }
    };

    return node;
  }
  else if (figmaNode.type === "INSTANCE") {
    const layoutMode = figmaNode.layoutMode;
    const flexDirection = layoutMode === "HORIZONTAL" && "row" || layoutMode === "VERTICAL" && "column";

    const layoutWrap = figmaNode.layoutWrap;
    const flexWrap = layoutWrap === "NO_WRAP" && "nowrap" || layoutWrap === "WRAP" && "wrap";

    const primaryAxisAlignItems = figmaNode.primaryAxisAlignItems;
    const justifyContent = primaryAxisAlignItems === "MIN" && "flex-start" || primaryAxisAlignItems === "MAX" && "flex-end" || primaryAxisAlignItems === "CENTER" && "center" || primaryAxisAlignItems === "SPACE_BETWEEN" && "space-between";

    const counterAxisAlignItems = figmaNode.counterAxisAlignItems;
    const alignItems = counterAxisAlignItems === "MIN" && "stretch" || counterAxisAlignItems === "MAX" && "flex-end" || counterAxisAlignItems === "CENTER" && "center";

    const gap = figmaNode.itemSpacing;

    const layoutSizingHorizontal = figmaNode.layoutSizingHorizontal;
    const width = layoutSizingHorizontal === "FIXED" && figmaNode.width || layoutSizingHorizontal === "FILL" && (!parentIsMainAxisRow && parentStretchItems && "auto" || "100%") || layoutSizingHorizontal === "HUG" && "fit-content";

    const layoutSizingVertical = figmaNode.layoutSizingVertical;
    const height = layoutSizingVertical === "FIXED" && figmaNode.height || layoutSizingVertical === "FILL" && (parentIsMainAxisRow && parentStretchItems && "auto" || "100%") || layoutSizingVertical === "HUG" && "fit-content";

    const node = {
      constructor: "Layta.Node",
      children: [] as any[],
      id: figmaNode.name,
      visible: figmaNode.visible,
      flexDirection,
      flexWrap,
      justifyContent,
      alignItems,
      gap,
      width,
      height,
      backgroundColor: getBackgroundColor(figmaNode),
      strokeColor: getStrokeColor(figmaNode),
      ...getStrokeWeightProps(figmaNode),
      ...getBorderRadiusProps(figmaNode)
    };

    for (const figmaChild of figmaNode.children) {
      try {
        node.children.push(await createNode(figmaChild, flexDirection === "row", true));
      } catch (e) {
        console.log(e);
      }
    };

    return node;
  }
  else if (figmaNode.type === "RECTANGLE") {
    const layoutSizingHorizontal = figmaNode.layoutSizingHorizontal;
    const width = layoutSizingHorizontal === "FIXED" && figmaNode.width || layoutSizingHorizontal === "FILL" && (!parentIsMainAxisRow && parentStretchItems && "auto" || "100%") || layoutSizingHorizontal === "HUG" && "fit-content";

    const layoutSizingVertical = figmaNode.layoutSizingVertical;
    const height = layoutSizingVertical === "FIXED" && figmaNode.height || layoutSizingVertical === "FILL" && (parentIsMainAxisRow && parentStretchItems && "auto" || "100%") || layoutSizingVertical === "HUG" && "fit-content";

    const node = {
      constructor: "Layta.Node",
      children: [] as any[],
      id: figmaNode.name,
      visible: figmaNode.visible,
      width,
      height,
      backgroundColor: getBackgroundColor(figmaNode),
      strokeColor: getStrokeColor(figmaNode),
      ...getStrokeWeightProps(figmaNode),
      ...getBorderRadiusProps(figmaNode),
    };

    return node;
  }
  else if (figmaNode.type === "TEXT") {
    const layoutSizingHorizontal = figmaNode.layoutSizingHorizontal;
    const width = layoutSizingHorizontal === "FIXED" && figmaNode.width || layoutSizingHorizontal === "FILL" && (!parentIsMainAxisRow && parentStretchItems && "auto" || "100%") || layoutSizingHorizontal === "HUG" && "fit-content";

    const layoutSizingVertical = figmaNode.layoutSizingVertical;
    const height = layoutSizingVertical === "FIXED" && figmaNode.height || layoutSizingVertical === "FILL" && (parentIsMainAxisRow && parentStretchItems && "auto" || "100%") || layoutSizingVertical === "HUG" && "fit-content";

    const [fontName, fontSize] = getTextFont(figmaNode);

    const node = {
      constructor: "Layta.Text",
      id: figmaNode.name,
      visible: figmaNode.visible,
      value: figmaNode.characters,
      width,
      height,
      foregroundColor: getTextColor(figmaNode),
      font: `dxCreateFont("${fontName}", ${fontSize}, false, "cleartype_natural") or "default"`,
      wordWrap: figmaNode.textAutoResize === "HEIGHT"
    };

    return node;
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