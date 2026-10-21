import type * as THREE from "three";

import { CYAN, YELLOW } from "./looks.ts";
import { SHOP_FONT } from "./shop-texture.ts";
import { sheet, textureOf } from "./texture-canvas.ts";

export const chevronTexture = (): THREE.CanvasTexture => {
  const { canvas, context } = sheet(128, 96);
  context.fillStyle = YELLOW;
  context.fillRect(0, 0, 128, 96);
  context.fillStyle = "#15171a";
  context.beginPath();
  context.moveTo(34, 10);
  context.lineTo(66, 10);
  context.lineTo(100, 48);
  context.lineTo(66, 86);
  context.lineTo(34, 86);
  context.lineTo(68, 48);
  context.closePath();
  context.fill();
  return textureOf(canvas, false);
};

export const warningSignTexture = (): THREE.CanvasTexture => {
  const { canvas, context } = sheet(128, 128);
  context.fillStyle = YELLOW;
  context.fillRect(0, 0, 128, 128);
  context.strokeStyle = "#15171a";
  context.lineWidth = 10;
  context.strokeRect(9, 9, 110, 110);
  context.translate(64, 64);
  context.rotate(-Math.PI / 4);
  context.lineCap = "round";
  context.lineWidth = 9;
  context.beginPath();
  context.moveTo(-6, 30);
  context.lineTo(-6, 6);
  context.quadraticCurveTo(-6, -12, 10, -12);
  context.lineTo(18, -12);
  context.stroke();
  context.fillStyle = "#15171a";
  context.beginPath();
  context.moveTo(14, -24);
  context.lineTo(30, -12);
  context.lineTo(14, 0);
  context.closePath();
  context.fill();
  return textureOf(canvas, false);
};

export const bannerTexture = (label: string): THREE.CanvasTexture => {
  const { canvas, context } = sheet(1024, 128);
  context.fillStyle = "#0b0612";
  context.fillRect(0, 0, 1024, 128);
  context.strokeStyle = CYAN;
  context.lineWidth = 8;
  context.strokeRect(6, 6, 1012, 116);
  context.fillStyle = YELLOW;
  context.font = SHOP_FONT.replace("44px", "96px");
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.shadowColor = YELLOW;
  context.shadowBlur = 16;
  context.fillText(label, 512, 70);
  return textureOf(canvas, false);
};
