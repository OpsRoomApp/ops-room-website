import { useState, useEffect } from 'react';
import SEO from '../components/SEO.jsx';
import { PAGE_TITLES } from '../config/seo.js';

const PRESS = {
  en: {
    release: 'FOR IMMEDIATE RELEASE',
    headline: 'OPS ROOM Brings a Complete Airline Operations Center to Microsoft Flight Simulator, Free',
    lead: 'OPS ROOM is now available as a free, all-in-one cockpit operations suite for Microsoft Flight Simulator 2020 and 2024, covering everything from SimBrief dispatch and performance calculations to Black Box flight recording, GSX ground automation and a native app inside the MSFS 2024 cockpit EFB.',
    intro: [
      'OPS ROOM is a free Windows companion that turns a home flight deck into an airline operations center. Instead of juggling separate windows for dispatch, weather, recording and ground services, pilots get one connected workspace that follows every flight from the first briefing to the final logbook entry. It runs alongside the simulator as a desktop app, in any browser, on a tablet or iPad over the local network, as a toolbar tablet panel inside both MSFS 2020 and 2024, and as a native app inside the MSFS 2024 cockpit EFB.',
      'No plugins are required, no account is needed and everything runs locally. OPS ROOM is free during its public beta.',
    ],
    sections: [
      {
        title: 'Plan the flight',
        paragraphs: [
          'The Briefing module imports the SimBrief operational flight plan and brings the route, weather, METAR and TAF data, live precipitation radar, FAA NOTAMs, charts and airport information into one screen. Procedures provides aircraft checklists and flows, and Scratchpad keeps personal notes with the flight.',
          'The Performance module is a first-party takeoff and landing calculator for the A320 family and the 737 family, delivering V speeds, flap and trim settings, flex and assumed temperature, and runway distance guidance. It auto-fills runway, wind, temperature, QNH and weights from SimBrief, live weather and the simulator, leaving the pilot to review and confirm one value.',
          'The Live OFP dispatch board compares the plan against what actually happens in the simulator: planned versus actual times, fuel and weights at every stage, with a signed loadsheet before departure and a signed flight completion after arrival.',
        ],
      },
      {
        title: 'Run the operation',
        paragraphs: [
          'Flight Watch gives a live view of the aircraft, position and flight state, and Ground Control coordinates GSX across the major airliner add-ons, including Fenix, PMDG, iniBuilds, Aerosoft and FSLabs, handling boarding, catering, water, pushback and arrival services with every service recorded as a receipt linked to the flight. Fenix A320 pilots get extra depth with loadsheet synchronization and takeoff performance data. Runway Awareness provides RAAS-style callouts and closure alerts, and CPDLC over Hoppie adds full controller-pilot datalink including PDC requests. The Announcer handles automated cabin and operational announcements, with volume that follows the selected camera view.',
          'VATSIM pilots get an integrated FIDS display of live network traffic, and while the aircraft is parked at the gate during boarding you can pick any aircraft on the network and follow it with the native sim camera: watch arrivals glide down the approach, judge other pilots\' landings, and enjoy a bit of planespotting while you wait. Discord integration adds rich presence, opt-in flight sharing and a public leaderboard.',
        ],
      },
      {
        title: 'Record, replay and review',
        paragraphs: [
          'Black Box is a continuous flight data recorder built into the app. It captures the flight path, aircraft motion, controls, engines, systems, autopilot, flaps and gear at up to 30 Hz during takeoff, approach and landing, and reconstructs landing performance including touchdown speed, vertical speed, G-loading and bounce detection. Recordings replay inside the simulator with scrubbing, pause, loop and speed controls, and export to CSV, GPX and KML.',
          'Live FAA NOTAMs show up as in-sim closure markers on runways and taxiways, shipped as an MSFS Community package for both 2020 and 2024.',
          'After landing, the Logbook and PIREP review the whole flight: runway profiles, stability gates, touchdown metrics, passenger satisfaction and a full score breakdown. Finances adds airline and pilot economy with revenue, costs, GSX receipts and balances, and receipts print to a thermal or POS printer.',
        ],
      },
      {
        title: 'One console, everywhere',
        paragraphs: [
          'OPS ROOM runs on the PC, in any tablet browser, inside the simulator as a toolbar tablet panel for MSFS 2020 and 2024, and as a native app in the MSFS 2024 EFB alongside other cockpit apps. Every surface shows the same live data because they all talk to the one desktop app on the PC.',
          '"OPS ROOM started as a handful of cockpit tools and grew into the operations center I wanted to exist," said the developer. "Every module is built and tested in real flights, and the whole thing is free during beta. If you fly airliners with GSX or on VATSIM, it replaces a pile of separate windows with one console."',
        ],
      },
    ],
    availability: [
      'OPS ROOM is free during public beta for Windows and works with Microsoft Flight Simulator 2020 and 2024. A live demo of the interface is available at https://opsroom.live/demo, and the full download, release history and community leaderboard are at https://opsroom.live.',
    ],
    about: [
      'OPS ROOM is a free, local-first cockpit operations suite for Microsoft Flight Simulator. It brings dispatch, performance, flight recording, weather, NOTAMs, ground services, datalink, announcements and debriefing into one connected workspace for MSFS 2020 and 2024. It is developed and tested by real-world flights with a community of testers, and is available during public beta at https://opsroom.live.',
    ],
    contact: {
      heading: 'Media contact',
      name: 'Nishant',
      discord: '@exzonom on Discord',
      url: 'https://opsroom.live',
    },
  },
  de: {
    release: 'SOFORT ZUR VERÖFFENTLICHUNG',
    headline: 'OPS ROOM bringt ein komplettes Airline-Operations-Center in Microsoft Flight Simulator, kostenlos',
    lead: 'OPS ROOM ist jetzt als kostenlose All-in-One-Operations-Suite für Microsoft Flight Simulator 2020 und 2024 verfügbar: von SimBrief-Dispatch und Leistungsberechnung über Black-Box-Flugaufzeichnung und GSX-Bodenautomation bis zur nativen App im MSFS-2024-Cockpit-EFB.',
    intro: [
      'OPS ROOM ist ein kostenloser Windows-Begleiter, der das heimische Flugdeck in ein Airline-Operations-Center verwandelt. Anstatt für Dispatch, Wetter, Aufzeichnung und Bodendienste mehrere Fenster offen zu halten, bekommen Piloten einen einzigen vernetzten Arbeitsbereich, der jeden Flug von der ersten Einweisung bis zum letzten Logbucheintrag begleitet. Die App läuft parallel zum Simulator: als Desktop-App, in jedem Browser, auf einem Tablet oder iPad im lokalen Netzwerk, als Tablet-Panel in der Simulator-Toolbar von MSFS 2020 und 2024 sowie als native App im MSFS-2024-Cockpit-EFB.',
      'Keine Plugins erforderlich, kein Konto nötig, alles läuft lokal. OPS ROOM ist während der öffentlichen Beta kostenlos.',
    ],
    sections: [
      {
        title: 'Den Flug planen',
        paragraphs: [
          'Das Briefing-Modul importiert den operationellen Flugplan von SimBrief und bündelt Route, Wetter, METAR- und TAF-Daten, Live-Regenradar, FAA-NOTAMs, Karten und Flughafeninformationen in einem Bildschirm. Procedures liefert Checklisten und Abläufe für das jeweilige Flugzeug, und Scratchpad hält persönliche Notizen beim Flug.',
          'Das Performance-Modul ist ein eigener Start- und Landerechner für die A320-Familie und die 737-Familie. Es liefert V-Geschwindigkeiten, Klappen- und Trimm-Einstellungen, Flex- und angenommene Temperatur sowie Startbahn-Distanzangaben. Runway, Wind, Temperatur, QNH und Gewichte werden automatisch aus SimBrief, Live-Wetter und Simulator übernommen; der Pilot prüft und bestätigt nur noch einen Wert.',
          'Das Live-OFP-Dispatch-Board vergleicht den Plan mit dem, was tatsächlich im Simulator passiert: geplante gegen tatsächliche Zeiten, Treibstoff und Gewichte in jeder Phase, mit unterschriebenem Loadsheet vor dem Abflug und unterschriebenem Flugabschluss nach der Ankunft.',
        ],
      },
      {
        title: 'Den Betrieb führen',
        paragraphs: [
          'Flight Watch zeigt einen Live-Blick auf Flugzeug, Position und Flugzustand. Ground Control koordiniert GSX über die großen Airliner-Add-ons hinweg, darunter Fenix, PMDG, iniBuilds, Aerosoft und FSLabs, und übernimmt Boarding, Catering, Wasser, Pushback und Ankunfts-Services, wobei jede Leistung als Quittung dem Flug zugeordnet wird. Fenix-A320-Piloten bekommen zusätzlich Loadsheet-Synchronisierung und Start-Performance-Daten. Runway Awareness bietet RAAS-artige Callouts und Schließungs-Warnungen, und CPDLC über Hoppie ergänzt die vollständige Controller-Pilot-Datenverbindung inklusive PDC-Requests. Der Announcer übernimmt automatisierte Kabinen- und Betriebsansagen, mit einer Lautstärke, die der gewählten Kameraperspektive folgt.',
          'VATSIM-Piloten erhalten ein integriertes FIDS-Display mit dem Live-Verkehr im Netzwerk. Während das Flugzeug beim Boarding am Gate geparkt ist, kann man jedes Flugzeug im Netzwerk auswählen und mit der nativen Sim-Kamera verfolgen: Ankünfte im Anflug beobachten, Landungen anderer Piloten bewerten und dabei ein bisschen Planespotting betreiben. Die Discord-Integration ergänzt Rich Presence, optionales Teilen von Flügen und ein öffentliches Leaderboard.',
        ],
      },
      {
        title: 'Aufzeichnen, wiedergeben und auswerten',
        paragraphs: [
          'Black Box ist ein kontinuierlicher Flugdatenrekorder, der direkt in die App integriert ist. Er erfasst Flugweg, Bewegung des Flugzeugs, Steuerflächen, Triebwerke, Systeme, Autopilot, Klappen und Fahrwerk mit bis zu 30 Hz während Start, Anflug und Landung und rekonstruiert die Landeleistung inklusive Aufsetzgeschwindigkeit, Sinkrate, G-Belastung und Bounce-Erkennung. Aufzeichnungen lassen sich im Simulator mit Spulen, Pause, Schleife und Geschwindigkeitsregelung wiedergeben und als CSV, GPX und KML exportieren.',
          'Live-FAA-NOTAMs erscheinen als In-Sim-Schließungsmarkierungen auf Start- und Rollbahnen, ausgeliefert als MSFS-Community-Paket für 2020 und 2024.',
          'Nach der Landung werten Logbuch und PIREP den gesamten Flug aus: Runway-Profile, Stabilitätskriterien, Aufsetz-Metriken, Passagierzufriedenheit und eine vollständige Punkteaufschlüsselung. Finances ergänzt Airline- und Pilotenökonomie mit Einnahmen, Kosten, GSX-Quittungen und Salden, und Quittungen lassen sich auf einem Thermodrucker oder POS-Drucker ausgeben.',
        ],
      },
      {
        title: 'Eine Konsole, überall',
        paragraphs: [
          'OPS ROOM läuft auf dem PC, in jedem Tablet-Browser, im Simulator als Tablet-Panel für MSFS 2020 und 2024 und als native App im MSFS-2024-EFB neben anderen Cockpit-Apps. Jede Oberfläche zeigt dieselben Live-Daten, weil alle mit derselben Desktop-App auf dem PC verbunden sind.',
          '„OPS ROOM begann als eine Handvoll Cockpit-Tools und wuchs zu dem Operations-Center heran, das ich haben wollte", sagt der Entwickler. „Jedes Modul wird in echten Flügen gebaut und getestet, und während der Beta ist das Ganze kostenlos. Wer Airliner mit GSX oder auf VATSIM fliegt, ersetzt damit einen Stapel einzelner Fenster durch eine einzige Konsole."',
        ],
      },
    ],
    availability: [
      'OPS ROOM ist während der öffentlichen Beta für Windows kostenlos und funktioniert mit Microsoft Flight Simulator 2020 und 2024. Eine Live-Demo der Oberfläche ist unter https://opsroom.live/demo verfügbar; Download, Versionsgeschichte und Community-Leaderboard gibt es unter https://opsroom.live.',
    ],
    about: [
      'OPS ROOM ist eine kostenlose, lokal ausgeführte Cockpit-Operations-Suite für Microsoft Flight Simulator. Sie bündelt Dispatch, Performance, Flugaufzeichnung, Wetter, NOTAMs, Bodendienste, Datalink, Ansagen und Debriefing in einem vernetzten Arbeitsbereich für MSFS 2020 und 2024. Die Suite wird in echten Flügen mit einer Community von Testern entwickelt und getestet und ist während der öffentlichen Beta unter https://opsroom.live verfügbar.',
    ],
    contact: {
      heading: 'Pressekontakt',
      name: 'Nishant',
      discord: '@exzonom auf Discord',
      url: 'https://opsroom.live',
    },
  },
};

function Links({ text }) {
  // Turn bare https:// URLs in plain paragraphs into real links.
  const parts = text.split(/(https:\/\/[^\s]+)/g);
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith('https://') ? (
          <a key={i} href={part} target="_blank" rel="noopener noreferrer">
            {part}
          </a>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}

export default function PressRelease() {
  const [lang, setLang] = useState('en');

  // Remember the reader's choice so the toggle survives navigation.
  useEffect(() => {
    const saved = window.localStorage.getItem('opsroom-press-lang');
    if (saved === 'de' || saved === 'en') setLang(saved);
  }, []);
  useEffect(() => {
    window.localStorage.setItem('opsroom-press-lang', lang);
  }, [lang]);

  const c = PRESS[lang];

  return (
    <>
      <SEO
        title={PAGE_TITLES.press}
        description="Press release: OPS ROOM brings a complete airline operations center to Microsoft Flight Simulator, free. Available in English and German."
        path="/press"
      />

      <section className="section">
        <div className="container">
          <div className="section-head">
            <span className="section-eyebrow">/ PRESS</span>
            <h1 className="section-title">Press release.</h1>
            <p className="section-subtitle">
              OPS ROOM is a free, all-in-one cockpit operations suite for Microsoft
              Flight Simulator 2020 and 2024. The full release is below, in English
              and German.
            </p>
            <div
              style={{
                display: 'inline-flex',
                marginTop: '1rem',
                border: '1px solid var(--line)',
                borderRadius: '6px',
                overflow: 'hidden',
                fontFamily: 'var(--font-mono)',
                fontSize: '12px',
                letterSpacing: '0.08em',
              }}
              role="group"
              aria-label="Press release language"
            >
              {['en', 'de'].map((code) => (
                <button
                  key={code}
                  type="button"
                  onClick={() => setLang(code)}
                  aria-pressed={lang === code}
                  style={{
                    padding: '0.5rem 1rem',
                    background: lang === code ? 'var(--acc)' : 'transparent',
                    color: lang === code ? '#fff' : 'var(--fg-muted)',
                    border: 'none',
                    cursor: 'pointer',
                    textTransform: 'uppercase',
                    font: 'inherit',
                  }}
                >
                  {code === 'en' ? 'EN' : 'DE'}
                </button>
              ))}
            </div>
          </div>

          <article
            className="doc-section"
            style={{ maxWidth: '760px', lineHeight: 1.7, color: 'var(--fg-soft)' }}
          >
            <p
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '12px',
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color: 'var(--fg-muted)',
              }}
            >
              {c.release}
            </p>

            <h2
              style={{
                fontSize: '1.6rem',
                lineHeight: 1.25,
                margin: '1.25rem 0 1rem',
                color: 'var(--fg)',
              }}
            >
              {c.headline}
            </h2>

            <p
              style={{
                fontSize: '1.05rem',
                fontWeight: 600,
                color: 'var(--fg)',
                marginBottom: '1.25rem',
              }}
            >
              <Links text={c.lead} />
            </p>

            {c.intro.map((p, i) => (
              <p key={i} style={{ marginBottom: '1rem' }}>
                <Links text={p} />
              </p>
            ))}

            {c.sections.map((section, si) => (
              <div key={si}>
                <h3
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '13px',
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                    color: 'var(--acc)',
                    margin: '2rem 0 0.75rem',
                  }}
                >
                  {section.title}
                </h3>
                {section.paragraphs.map((p, pi) => (
                  <p key={pi} style={{ marginBottom: '1rem' }}>
                    <Links text={p} />
                  </p>
                ))}
              </div>
            ))}

            <h3
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '13px',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: 'var(--acc)',
                margin: '2rem 0 0.75rem',
              }}
            >
              {lang === 'en' ? 'Availability' : 'Verfügbarkeit'}
            </h3>
            {c.availability.map((p, i) => (
              <p key={i} style={{ marginBottom: '1rem' }}>
                <Links text={p} />
              </p>
            ))}

            <h3
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '13px',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: 'var(--acc)',
                margin: '2rem 0 0.75rem',
              }}
            >
              {lang === 'en' ? 'About OPS ROOM' : 'Über OPS ROOM'}
            </h3>
            {c.about.map((p, i) => (
              <p key={i} style={{ marginBottom: '1rem' }}>
                <Links text={p} />
              </p>
            ))}

            <h3
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '13px',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: 'var(--acc)',
                margin: '2rem 0 0.75rem',
              }}
            >
              {c.contact.heading}
            </h3>
            <p style={{ marginBottom: '0.25rem' }}>{c.contact.name}</p>
            <p style={{ marginBottom: '0.25rem' }}>{c.contact.discord}</p>
            <p>
              <a href={c.contact.url} target="_blank" rel="noopener noreferrer">
                {c.contact.url}
              </a>
            </p>
          </article>
        </div>
      </section>
    </>
  );
}
