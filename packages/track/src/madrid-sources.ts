export const madridSources = [
  {
    attribution:
      "Origen de los datos: Ayuntamiento de Madrid. Callejero oficial, consulta del 24/10/2026.",
    changes:
      "Authoring reference for the named street sequence only. No street-register polygons are included in the processed corridor.",
    date: "2026-10-24 service snapshot; updated daily",
    id: "madrid-streets",
    licence: "CC BY 4.0",
    licenceUrl: "https://creativecommons.org/licenses/by/4.0/",
    name: "Madrid official street register · Viales vigentes",
    url: "https://datos.madrid.es/dataset/300735-0-mapas-callejero-viales",
  },
  {
    attribution:
      "Origen de los datos: Ayuntamiento de Madrid. Ancho medio de viario, 01/12/2019.",
    changes:
      "Street-area width estimates were matched to road links. They include the street area and are not measured paved widths.",
    date: "2019-12-01; service snapshot 2026-10-24",
    id: "madrid-widths",
    licence: "CC BY 4.0",
    licenceUrl: "https://creativecommons.org/licenses/by/4.0/",
    name: "Madrid municipal cartography · Ancho medio de viario",
    url: "https://geoportal.madrid.es/IDEAM_WBGEOPORTAL/dataset.iam?id=50eb8888-9edf-11ea-94f1-987654321",
  },
  {
    attribution:
      "Origen de los datos: Ayuntamiento de Madrid. Semáforos con avisadores acústicos, actualización 01/10/2026.",
    changes:
      "Acoustic signal devices within 40 metres of the route were retained. This is a partial signal inventory, with no signal phases or crossing outlines.",
    date: "2026-10-01; covers September 2026",
    id: "madrid-signals",
    licence: "CC BY 4.0",
    licenceUrl: "https://creativecommons.org/licenses/by/4.0/",
    name: "Madrid traffic · Semáforos con avisadores acústicos",
    url: "https://datos.madrid.es/dataset/202539-0-semaforos-avisadores",
  },
  {
    attribution:
      "CC BY 4.0 ign.es. Corridor geometry derived from Información Geográfica de Referencia de Redes de Transporte, service snapshot 24/10/2026.",
    changes:
      "Selected road links were ordered, rounded to 0.1 metres and translated to local coordinates. Junctions use shared source node IDs. Fictitious source links retain their flag.",
    date: "2026-10-24 service snapshot; per-link lifespan dates retained in the input",
    id: "ign-roads",
    licence: "CC BY 4.0",
    licenceUrl:
      "https://www.ign.es/resources/licencia/Condiciones_licenciaUso_IGN.pdf",
    name: "IGN · IGR Redes de Transporte · RoadLink",
    url: "https://servicios.idee.es/wfs-inspire/transportes?service=WFS&request=GetCapabilities",
  },
  {
    attribution:
      "CC BY 4.0 ign.es. Elevation profile derived from MDT05, service snapshot 24/10/2026.",
    changes:
      "The 5 metre ground grid was sampled every 10 metres along the route. Values describe terrain, including beneath bridges, and are not road-deck heights.",
    date: "2026-10-24 service snapshot; Elevacion25830_5",
    id: "ign-elevation",
    licence: "CC BY 4.0",
    licenceUrl:
      "https://www.ign.es/resources/licencia/Condiciones_licenciaUso_IGN.pdf",
    name: "IGN · Modelo Digital del Terreno · MDT05",
    url: "https://servicios.idee.es/wcs-inspire/mdt?service=WCS&request=GetCapabilities&version=1.0.0",
  },
  {
    attribution:
      "Microsoft Global ML Building Footprints, release 2026-08-13, Spain tile 033111012.",
    changes:
      "Footprints were clipped to the corridor, simplified and rounded. Available Microsoft heights are machine estimates. Missing heights remain unavailable.",
    date: "2026-08-13",
    id: "microsoft-buildings",
    licence: "CDLA Permissive 2.0",
    licenceUrl: "/licenses/cdla-permissive-2.0.txt",
    name: "Microsoft · Global ML Building Footprints",
    url: "https://github.com/microsoft/GlobalMLBuildingFootprints",
  },
  {
    attribution:
      "Landmark names and coordinate statements from Wikidata. Structured data is available under CC0.",
    changes:
      "Only structured names, coordinates and revision IDs were retained. Positions were converted to local metres.",
    date: "2026-10-24 retrieval; pinned entity revisions listed in the corridor inputs",
    id: "wikidata-landmarks",
    licence: "CC0 1.0",
    licenceUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
    name: "Wikidata · landmark facts",
    url: "https://www.wikidata.org/wiki/Wikidata:Licensing",
  },
] as const;
