export const SITE = {
  name: 'OPS ROOM',
  tagline: 'Free MSFS Cockpit Ops Suite',
  description:
    'Free cockpit ops suite for MSFS 2020 and 2024: dispatch, Flight Watch, Black Box replay, RAAS, performance and VATSIM FIDS in the cockpit tablet and on the EFB.',
  url: 'https://opsroom.live',
  // og:image must be a product screenshot (1200x630 crop ideal), not the logo
  // mark, every shared opsroom.live link becomes a billboard.
  image: 'https://opsroom.live/og-image.png',
  twitter: '@opsroomlive',
};

// Per-page keyword sets, emitted as <meta name="keywords"> and used in the
// JSON-LD SoftwareApplication keywords field. Google mostly ignores the meta
// tag these days, but Bing reads it and the JSON-LD copy feeds rich results,
// so it is free to keep them aligned with each page's actual topic.
export const PAGE_KEYWORDS = {
  home: 'OPS ROOM, free MSFS flight tracker, MSFS flight recorder, MSFS EFB app, MSFS dispatch, cockpit ops suite, MSFS 2024 EFB, MSFS 2020 tools, VATSIM FIDS, GSX automation, flight operations software',
  features: 'MSFS flight recorder, MSFS EFB app, MSFS dispatch tool, Black Box replay, RAAS MSFS, VATSIM FIDS, GSX automation, CPDLC datalink, MSFS cockpit modules, flight operations suite',
  technology: 'SimConnect, FSUIPC, GSX Pro integration, Fenix A320, PMDG 737, iniBuilds, FlyByWire, MSFS aircraft telemetry, MSFS addon integration',
  download: 'download OPS ROOM, free MSFS flight recorder download, MSFS EFB app free, MSFS ops suite Windows, MSFS 2024 addon free',
  gettingStarted: 'OPS ROOM install, MSFS setup guide, FSUIPC setup, SimBrief connect, MSFS EFB setup, OPS ROOM onboarding',
  documentation: 'OPS ROOM documentation, MSFS flight recorder manual, MSFS EFB guide, dispatch module docs, Black Box user guide',
  changelog: 'OPS ROOM changelog, OPS ROOM updates, MSFS flight recorder release notes, MSFS ops suite version history',
  contact: 'OPS ROOM support, MSFS addon help, report MSFS app bug, OPS ROOM contact',
  faq: 'MSFS flight recorder question, MSFS EFB app FAQ, free MSFS flight tracker, MSFS dispatch OFP, OPS ROOM troubleshooting',
  privacy: 'OPS ROOM privacy policy, MSFS flight recorder data, OPS ROOM data storage',
  leaderboard: 'MSFS flight hours leaderboard, MSFS landing rate rankings, OPS ROOM community, flight sim leaderboard',
  press: 'OPS ROOM press release, OPS ROOM news, MSFS operations suite announcement, MSFS 2024 EFB press, OPS ROOM media kit',
  screenshots: 'OPS ROOM screenshots, MSFS flight recorder interface, MSFS EFB app screenshots, Black Box replay screenshots',
  demo: 'OPS ROOM demo, MSFS flight recorder online demo, try MSFS EFB app, flight operations suite demo',
  efbApps: 'best MSFS 2024 EFB apps, MSFS EFB apps, MSFS 2024 tablet apps, Navigraph MSFS, Sky4Sim MSFS, free MSFS EFB',
  'efb-apps': 'best MSFS 2024 EFB apps, MSFS EFB apps, MSFS 2024 tablet apps, Navigraph MSFS, Sky4Sim MSFS, free MSFS EFB',
};

export const PAGE_TITLES = {
  home: `OPS ROOM: Free MSFS Cockpit Ops Suite (Dispatch, Flight Watch, Black Box, EFB)`,
  features: `OPS ROOM Modules: Free Flight Recorder, Dispatch, RAAS for MSFS 2020 & 2024`,
  technology: `OPS ROOM Technology: SimConnect, FSUIPC, GSX & Fenix Integration`,
  download: `Download OPS ROOM: Free MSFS Ops Suite (Windows)`,
  gettingStarted: `Install & Setup OPS ROOM: MSFS 2020 & 2024`,
  documentation: `OPS ROOM Documentation: Modules, Settings & Integration`,
  changelog: `OPS ROOM Changelog: Free MSFS Ops Suite Updates`,
  contact: `Support: OPS ROOM Free MSFS Ops Suite`,
  faq: `OPS ROOM FAQ: Free MSFS EFB, Flight Recorder & Dispatch`,
  privacy: `Privacy Policy: OPS ROOM`,
  leaderboard: `OPS ROOM Community Leaderboard: Flight Hours & Landings`,
  efbApps: `Best MSFS 2024 EFB Apps (Free & Paid) | OPS ROOM`,
  press: `Press Release: OPS ROOM Brings an Airline Operations Center to MSFS, Free`,
};
