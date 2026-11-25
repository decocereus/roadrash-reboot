import * as THREE from "three";

import { contactNames } from "../src/game/bike-fit.ts";
import type { BikeFit, ContactName } from "../src/game/bike-fit.ts";
import { contactsOf } from "../src/game/figure-contacts.ts";
import type { Contacts } from "../src/game/figure-contacts.ts";
import type { Stance } from "../src/game/rider-figure.ts";

export const seatedStance = (stance: Partial<Stance>): Stance => ({
  flinch: 0,
  flinchSide: 1,
  lean: 0,
  pose: "seated",
  reach: 0,
  rise: 0,
  side: 1,
  speed: 0,
  time: 0,
  tuck: 0,
  weapon: "none",
  ...stance,
});

export const bodyOf = (root: THREE.Object3D): THREE.SkinnedMesh => {
  let body: THREE.SkinnedMesh | null = null;
  root.traverse((node) => {
    if (body === null && node instanceof THREE.SkinnedMesh) {
      body = node;
    }
  });
  if (body === null) {
    throw new Error("The rider has no skinned body.");
  }
  return body;
};

export const placesOf = (root: THREE.Object3D, contacts: Contacts) => {
  root.updateMatrixWorld(true);
  const placed = (contact: ContactName) => {
    const bone = root.getObjectByName(contact);
    if (!bone) {
      throw new Error(`The rider has no ${contact} bone.`);
    }
    return bone.localToWorld(contacts[contact].clone());
  };
  return {
    foot_l: placed("foot_l"),
    foot_r: placed("foot_r"),
    hand_l: placed("hand_l"),
    hand_r: placed("hand_r"),
  };
};

export const worstContact = (
  root: THREE.Object3D,
  bike: THREE.Object3D,
  fit: BikeFit
): number => {
  root.updateWorldMatrix(true, true);
  bike.updateWorldMatrix(true, false);
  const places = placesOf(root, contactsOf(bodyOf(root), root));
  return Math.max(
    ...contactNames.map((name) =>
      places[name].distanceTo(bike.localToWorld(fit[name].clone()))
    )
  );
};
