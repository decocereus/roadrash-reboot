import type { CorridorData, Position } from "@racer/track/madrid-schema";

import { round } from "./geometry.ts";

const escape = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll('"', "&quot;");
const colors = { city: "#55d9ec", "old-city": "#ffa66c", park: "#ace57a" };
const mapPoint = (p: Position): string =>
  `${round(p[0])},${round(2700 - p[1])}`;
const points = (line: readonly Position[]): string =>
  line.map(mapPoint).join(" ");

export const preview = (
  data: CorridorData,
  assets: {
    readonly dataLicence: string;
    readonly font: string;
    readonly fontLicence: string;
  },
  bytes: number
): string => {
  const buildings = data.buildings
    .map((building) => {
      const height =
        building.height.kind === "unavailable" ? 0 : building.height.metres;
      const path = building.rings
        .map((ring) => `M ${ring.map(mapPoint).join(" L ")} Z`)
        .join(" ");
      return `<path d="${path}" fill="#222" fill-rule="evenodd" stroke="#535353" stroke-width="1.5" style="transform:translate(${-height * 0.25}px,${-height * 0.5}px)"><title>${building.id} · ${height === 0 ? "height unavailable" : `${height} m estimated`}</title></path>`;
    })
    .join("");
  const route = data.streets
    .map(
      (street, index) =>
        `<g class="route" data-zone="${street.zone}">${street.links.map((link) => `<polyline points="${points(link.centreline)}" fill="none" stroke="${colors[street.zone]}" stroke-width="13" ${link.bridge === null ? "" : 'stroke-dasharray="18 12"'} stroke-linejoin="round" stroke-linecap="round"><title>${escape(street.name)} · ${street.startM} to ${street.endM} m</title></polyline>`).join("")}<text x="${street.links[0].centreline[0][0] + 17}" y="${2700 - street.links[0].centreline[0][1] - 16}" fill="white" font-size="34" paint-order="stroke" stroke="black" stroke-width="8">${index + 1}</text></g>`
    )
    .join("");
  const landmarks = data.landmarks
    .map(
      (landmark, index) =>
        `<g><circle cx="${landmark.position[0]}" cy="${2700 - landmark.position[1]}" r="19" fill="white" stroke="black" stroke-width="5"/><text x="${landmark.position[0]}" y="${2700 - landmark.position[1] + 9}" fill="black" text-anchor="middle" font-size="27">${String.fromCodePoint(65 + index)}</text><title>${escape(landmark.name)} · ${landmark.wikidata} · ${(landmark.atM / 1000).toFixed(2)} km</title></g>`
    )
    .join("");
  const profile = data.elevation
    .map(
      (sample) =>
        `${round((sample.atM / data.lengthM) * 1000)},${round(160 - (sample.groundM - 570) * 1.5)}`
    )
    .join(" ");
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Madrid corridor · Lowside map-1</title><style>
@font-face{font-family:Geist;src:url(data:font/woff2;base64,${assets.font}) format('woff2');font-weight:100 900}*{box-sizing:border-box}body{margin:0;padding:32px;background:#000;color:#fff;font:14px/1.55 Geist,system-ui,sans-serif}main{max-width:1360px;margin:auto}h1{font-size:38px;line-height:1.1;letter-spacing:-1.5px;margin:8px 0 16px}h2{font-size:20px;margin:24px 0 8px}p{max-width:900px;color:#b3b3b3}a{color:inherit}button{background:#111;color:#fff;border:1px solid #555;padding:8px 14px;font:inherit;cursor:pointer}button[aria-pressed=false]{opacity:.45}.legend{display:flex;flex-wrap:wrap;gap:8px}.layout{display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:24px}.map{width:100%;height:640px;background:#080808;border:1px solid #333;touch-action:none;cursor:grab}ol{padding-left:24px}li{margin:6px 0}small{color:#aaa}table{border-collapse:collapse;width:100%;font-size:12px}td,th{text-align:left;vertical-align:top;border-bottom:1px solid #333;padding:10px 8px}th{color:#aaa}.stats{display:flex;gap:30px;margin:24px 0}.stats strong{font-size:26px;display:block}.profile{width:100%;height:180px}.muted{color:#aaa}@media(max-width:900px){body{padding:16px}.layout{grid-template-columns:1fr}.map{height:500px}.stats{flex-wrap:wrap;gap:18px}table{font-size:11px}}
</style><main><small>LOWSIDE / MAP-1 / SOURCE DATA ONLY</small><h1>Alcalá to the palace</h1><p>A connected corridor from Puerta de Alcalá through Gran Vía and Casa de Campo, returning by Puente de Segovia and Puerta de Toledo to surface Bailén. No track or renderer is wired to this file.</p><div class="stats"><div><strong>${(data.lengthM / 1000).toFixed(3)} km</strong>source centreline length</div><div><strong>${data.buildings.length}</strong>building footprints</div><div><strong>${bytes.toLocaleString("en")} B</strong>committed JSON</div><div><strong>${data.bufferM} m</strong>context buffer</div></div><div class="legend">${Object.entries(
    colors
  )
    .map(
      ([zone, color]) =>
        `<button data-toggle="${zone}" aria-pressed="true" style="border-color:${color};color:${color}">${zone}</button>`
    )
    .join(
      ""
    )}<button data-buildings aria-pressed="true">Building massing</button><button data-reset>Reset map</button></div><p><small>Scroll to zoom. Drag to pan. Hover for source details. North is up. Building roof offsets show estimated height at half scale. Unknown heights stay flat. Dashed spans mark bridge envelopes, with ground heights uncorrected. Zone boundaries are authoring choices.</small></p><div class="layout"><svg class="map" role="img" aria-label="Madrid race corridor and building massing" viewBox="350 430 4450 2350"><g id="buildings">${buildings}</g>${route}${landmarks}</svg><aside><h2>Street chain</h2><ol>${data.streets.map((street) => `<li style="color:${colors[street.zone]}">${escape(street.name)}<br><small>${(street.startM / 1000).toFixed(2)} to ${(street.endM / 1000).toFixed(2)} km</small></li>`).join("")}</ol></aside></div><h2>Landmarks</h2><div class="layout"><ol type="A">${data.landmarks.map((landmark) => `<li><a href="https://www.wikidata.org/wiki/${landmark.wikidata}">${escape(landmark.name)}</a> <small>${landmark.wikidata} · ${(landmark.atM / 1000).toFixed(2)} km · ${landmark.distanceM} m off centreline</small></li>`).join("")}</ol><p class="muted">${data.junctions.length} junction nodes and ${data.signals.length} acoustic signal devices. Devices identify some signalised crossings. They do not define crossing geometry or phases.</p></div><h2>Ground elevation</h2><svg class="profile" role="img" aria-label="Ground elevation along the route" viewBox="0 0 1000 180" preserveAspectRatio="none"><polyline points="${profile}" stroke="#aaa" stroke-width="2" fill="none"/></svg><p>IGN MDT05 ground samples every 10 m, on a 5 m grid. Range ${Math.min(...data.elevation.map((p) => p.groundM))} to ${Math.max(...data.elevation.map((p) => p.groundM))} m. This is terrain beneath bridges too. It is not a road-deck profile. Measured paved widths are unavailable in the selected inputs. The separate municipal street-area widths are estimates.</p><h2>Sources and licences</h2><table><thead><tr><th>Dataset and date</th><th>Licence</th><th>Attribution and changes</th></tr></thead><tbody>${data.sources.map((source) => `<tr><td><a href="${escape(source.url)}">${escape(source.name)}</a><br>${escape(source.date)}</td><td><a href="${source.licenceUrl.startsWith("/") ? "https://cdla.dev/permissive-2-0/" : escape(source.licenceUrl)}">${escape(source.licence)}</a></td><td>${escape(source.attribution)} ${escape(source.changes)}</td></tr>`).join("")}</tbody></table><p><small>Geist font by Vercel, SIL Open Font License. No base-map tiles or imagery. Input hashes and exact download URLs are embedded in the corridor file.</small></p><details><summary>Building data licence</summary><pre style="white-space:pre-wrap">${escape(assets.dataLicence)}</pre></details><details><summary>Geist font licence</summary><pre style="white-space:pre-wrap">${escape(assets.fontLicence)}</pre></details></main><script>
const svg=document.querySelector('.map');const initial=[350,430,4450,2350];let view=[...initial];const draw=()=>svg.setAttribute('viewBox',view.join(' '));document.querySelectorAll('[data-toggle]').forEach(button=>button.addEventListener('click',()=>{const on=button.getAttribute('aria-pressed')!=='true';button.setAttribute('aria-pressed',String(on));document.querySelectorAll('[data-zone="'+button.dataset.toggle+'"]').forEach(g=>g.style.display=on?'':'none')}));document.querySelector('[data-buildings]').addEventListener('click',event=>{const button=event.currentTarget;const on=button.getAttribute('aria-pressed')!=='true';button.setAttribute('aria-pressed',String(on));document.querySelector('#buildings').style.display=on?'':'none'});document.querySelector('[data-reset]').addEventListener('click',()=>{view=[...initial];draw()});svg.addEventListener('wheel',event=>{event.preventDefault();const factor=event.deltaY>0?1.12:.89;const bounds=svg.getBoundingClientRect();const x=(event.clientX-bounds.left)/bounds.width;const y=(event.clientY-bounds.top)/bounds.height;view=[view[0]+view[2]*x*(1-factor),view[1]+view[3]*y*(1-factor),view[2]*factor,view[3]*factor];draw()},{passive:false});let drag=null;svg.addEventListener('pointerdown',event=>{drag=[event.clientX,event.clientY,...view];svg.setPointerCapture(event.pointerId)});svg.addEventListener('pointermove',event=>{if(!drag)return;const bounds=svg.getBoundingClientRect();view=[drag[2]-(event.clientX-drag[0])*drag[4]/bounds.width,drag[3]-(event.clientY-drag[1])*drag[5]/bounds.height,drag[4],drag[5]];draw()});svg.addEventListener('pointerup',()=>drag=null);
</script></html>`;
};
