import PageHeader from "../components/PageHeader";
import { GLOSSARY } from "../lib/glossary";
import { useData } from "../lib/useData";
import { inventoryCounts, type InventoryFile } from "../lib/inventoryMap";

function H2({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="mb-3 text-lg font-semibold text-ink-primary">
      {children}
    </h2>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="mb-3 text-sm leading-relaxed text-ink-secondary">{children}</p>;
}

function ExtLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="text-series-1 underline underline-offset-2"
    >
      {children}
    </a>
  );
}

export default function DataGovernance() {
  // Counts come straight from the machine-readable inventory so this page can't drift from it.
  const { data: inventory } = useData<InventoryFile>("dataset_inventory.json");
  const counts = inventory ? inventoryCounts(inventory) : null;
  const ingestedCount = counts?.ingested ?? null;
  const notIngestedCount = counts?.notIngested ?? null;

  return (
    <div>
      <PageHeader
        title="Data Governance & Terms"
        subtitle="Where the data comes from, what it cannot tell you, how privacy is handled, who to contact, and what the terms mean."
      />
      <div className="mx-auto max-w-4xl space-y-10 p-6 lg:p-10">
        {/* 1. Purpose */}
        <section aria-labelledby="m-purpose">
          <H2 id="m-purpose">1. Purpose and research question</H2>
          <P>
            The Malaysia Health Equity Observatory (MY-HEO) was built to answer one guiding question:{" "}
            <span className="font-medium text-ink-primary">
              where are health inequalities greatest in Malaysia, who is affected, and how do socioeconomic
              conditions relate to health outcomes?
            </span>{" "}
            It is intended for researchers, policymakers and members of the public who want to explore Malaysia's
            own official statistics on income, poverty, healthcare access and health outcomes at the national,
            state and district level, without having to independently collect, clean and join dozens of raw
            government CSV files themselves.
          </P>
          <P>
            Every number displayed anywhere on this site — every chart, map, table cell and statistic — traces back
            to a specific, citable, real dataset published by a Malaysian government agency on{" "}
            <ExtLink href="https://data.gov.my/data-catalogue">data.gov.my</ExtLink> or the official DOSM open-data
            mirror on GitHub. Nothing on this dashboard is simulated, estimated by the dashboard itself, or filled
            in to make a chart look complete. Where a number cannot be derived from the source data without making
            an assumption we are not confident in, the dashboard shows "No data" rather than a guess. This page sets
            out where the data comes from and its limits, so a researcher can verify any figure shown.
          </P>
        </section>

        {/* 2. Data sources */}
        <section aria-labelledby="m-sources">
          <H2 id="m-sources">2. Data sources</H2>
          <P>
            All data originates from three Malaysian government bodies, published through data.gov.my (the
            national open data portal) or the official{" "}
            <ExtLink href="https://github.com/dosm-malaysia/data-open">dosm-malaysia/data-open</ExtLink> GitHub
            mirror:
          </P>
          <ul className="mb-3 list-disc space-y-1 pl-5 text-sm leading-relaxed text-ink-secondary marker:text-series-1">
            <li>
              <span className="font-medium text-ink-primary">Department of Statistics Malaysia (DOSM)</span> —
              household income, poverty, Gini coefficient, access to basic amenities, population estimates and
              census tables, and the official administrative boundary geometries used for the choropleth maps.
            </li>
            <li>
              <span className="font-medium text-ink-primary">Ministry of Health Malaysia (MOH)</span> — hospital
              beds, healthcare staff, infant immunisation coverage, child nutritional status, and sexually
              transmitted disease incidence.
            </li>
            <li>
              <span className="font-medium text-ink-primary">National Registration Department (NRD), via DOSM</span>{" "}
              — civil registration statistics: deaths, maternal deaths, early childhood deaths and live births by
              state.
            </li>
          </ul>
          <P>
            {inventory?.last_refreshed && (
              <>
                The data was last rebuilt from source on{" "}
                <span className="font-medium text-ink-primary">{inventory.last_refreshed}</span> (checked every week by an
                automated workflow that publishes new data only after its tests pass).{" "}
              </>
            )}
            The dashboard currently uses{" "}
            <span className="font-medium text-ink-primary">{ingestedCount ?? "…"} datasets</span>, and a further{" "}
            <span className="font-medium text-ink-primary">{notIngestedCount ?? "…"} datasets</span> are known to exist
            but are not included yet (for example causes of death, divorce statistics and disability
            statistics, for which no machine-readable source is published). Every dataset, with its source link, date
            range, geographic resolution, known missingness and stated limitations, is itemised on the{" "}
            <a href="#/explorer" className="text-series-1 underline underline-offset-2">
              Data Explorer
            </a>{" "}
            page, which reads directly from the same machine-readable inventory used to write this page.
          </P>
        </section>

        {/* 3. Limitations */}
        <section aria-labelledby="m-limitations">
          <H2 id="m-limitations">3. Limitations</H2>
          <ul className="mb-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-ink-secondary marker:text-series-1">
            <li>
              <span className="font-medium text-ink-primary">Irregular survey years.</span> The Household Income
              and Expenditure Survey (HIES) — the source of all income, poverty and Gini figures — is not run
              annually; income/poverty/Gini series have real gaps between survey years, and district-level income,
              poverty and Gini are only available for three cross-sectional years (2019, 2022, 2024). These years
              should never be interpolated between, and this dashboard does not do so.
            </li>
            <li>
              <span className="font-medium text-ink-primary">Single-snapshot-year datasets.</span> Several datasets
              are included for only one recent year rather than a full time series (noted per dataset in the Data
              Explorer) — notably district-level hospital beds, ingested for the latest year the publisher has released (2022),
              even though the publisher also holds earlier years.
            </li>
            <li>
              <span className="font-medium text-ink-primary">Ethnicity–health linkage: counts only, no rate.</span>{" "}
              DOSM publishes annual deaths by state, sex and ethnicity, shown on the Health Outcomes page as a
              dedicated "Deaths by Ethnicity" view. What is still missing is
              a per-ethnicity-group <em>rate</em> — there is no state-level population-by-ethnicity denominator in
              this project's sources (only the district-level census tables break population down by ethnicity), so
              the dashboard shows raw death counts by ethnicity with an explicit non-rate caveat, not a per-capita
              comparison. Ethnicity composition itself is still shown separately, as a standalone population-structure
              view on the Population Equity page.
            </li>
            <li>
              <span className="font-medium text-ink-primary">STD incidence: 2017–2022 only.</span> Sexually
              transmitted disease case counts and incidence rates by state are only published for 2017–2022 in the
              source dataset, and reported/diagnosed cases likely understate true incidence — especially for
              HIV/AIDS — because of differences in testing access across states, which itself can be a proxy for
              the very inequities this dashboard is trying to surface rather than a clean measure independent of
              them.
            </li>
            <li>
              <span className="font-medium text-ink-primary">Immunisation and nutrition: national level only.</span>{" "}
              Infant immunisation coverage and under-5 nutritional status (stunting, wasting, underweight,
              overweight prevalence) are published by MOH only at the national level in the sources used here —
              there is no state or district breakdown available, so these indicators cannot be shown on any of this
              dashboard's geographic maps.
            </li>
            <li>
              <span className="font-medium text-ink-primary">Public-sector-only healthcare workforce.</span>{" "}
              Healthcare staff counts cover the public sector only and exclude private-sector doctors and nurses,
              who make up a significant share of healthcare capacity in urban areas — state comparisons of
              healthcare workforce density should be read as public-sector capacity, not total capacity.
            </li>
            <li>
              <span className="font-medium text-ink-primary">Klang Valley pooling for staff and bed rates.</span>{" "}
              Selangor, W.P. Kuala Lumpur and W.P. Putrajaya share national referral hospitals, a teaching hospital
              and federal institutions, so a per-resident rate for each on its own is not a like-for-like measure of
              how well its residents are served (W.P. Putrajaya's own staff rate, about 3,036 per 100,000 in 2022, is
              roughly nine times Selangor's 341, largely because its staff count sits against only about 117,000
              residents). For comparisons between areas — rankings, gap ratios, maps, the Priority Areas score,
              correlations and the AI assistant — the dashboard uses a pooled rate in which those three units' counts
              and populations are each summed and divided once (about 509 staff and 144 beds per 100,000 in 2022), and
              every other state keeps its own rate. Each territory's own rate is still shown in the Healthcare Access and
              Data Explorer tables. In correlations the three units are left out, since a pooled rate cannot be paired
              with any one of them. The source catalogue does not say whether staff are counted by place of work or by
              place of residence; the pooling is a comparison convention, not a correction of the source.
            </li>
            <li>
              <span className="font-medium text-ink-primary">Poverty-line methodology changes over time.</span>{" "}
              DOSM revised its Poverty Line Income methodology around 2019; pre- and post-2019 absolute poverty
              rates are not fully comparable, and this dashboard does not adjust for that break when showing the
              national or state poverty trend line.
            </li>
          </ul>
        </section>

        {/* 4. Privacy */}
        <section aria-labelledby="m-privacy">
          <H2 id="m-privacy">4. Privacy</H2>
          <P>
            The charts, maps and tables show aggregated public statistics only. This site has no accounts or logins,
            does not ask for personal information, and does not use advertising or analytics cookies.
          </P>
          <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed text-ink-secondary">
            <li>
              <span className="font-medium text-ink-primary">AI features.</span> If you use the MY-HEO Assistant, an
              "Explain this" button or a Research Opportunities card, your question or the chart data involved, plus
              the published data for the page you are on, is sent to an external AI service provided by Google, which
              writes the answer. Please do not submit personal, patient or confidential information. We keep only
              counters used to limit repeated requests (your IP address or, if unavailable, a code made from basic
              browser details, plus a daily total) and do not store your questions. Our hosting provider and Google may
              keep their own standard logs, which are governed by their own terms.
            </li>
            <li>
              <span className="font-medium text-ink-primary">Browser storage.</span> Answers you have already
              generated are kept in your browser for the current tab only, so they are not requested twice; closing the
              tab clears them.
            </li>
            <li>
              <span className="font-medium text-ink-primary">Third-party requests.</span> Pages are served by GitHub
              Pages, which can see your IP address as for any web request. The maps are drawn from boundary data bundled
              with this site and load no third-party map tiles.
            </li>
          </ul>
        </section>

        {/* 5. Licence and attribution */}
        <section aria-labelledby="m-licence">
          <H2 id="m-licence">5. Licence and attribution</H2>
          <ul className="mb-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-ink-secondary marker:text-series-1">
            <li>
              <span className="font-medium text-ink-primary">Code.</span> The dashboard's source code is open source under
              the MIT licence, with the licence file in the{" "}
              <ExtLink href="https://github.com/paulineyeohsq/mhet-malaysia-health-equity-tracker/blob/main/LICENSE">
                project repository
              </ExtLink>
              .
            </li>
            <li>
              <span className="font-medium text-ink-primary">Data.</span> The figures belong to their publishers and stay
              under the publishers' own terms; the MIT licence does not cover them. The datasets from the data.gov.my and
              OpenDOSM catalogue state that they are open under the Creative Commons Attribution 4.0 licence (CC BY 4.0),
              which asks you to credit the agency, link to the licence, say if you changed the data, and not suggest the
              agency endorses you. This dashboard aggregates, pools and reformats the data and says so beside each
              chart. The boundary and census files come from DOSM's open-data repository under DOSM's Open Data
              Licence, which also asks that you do not suggest official status or endorsement.
            </li>
            <li>
              <span className="font-medium text-ink-primary">Survey reports.</span> The National Health and Morbidity
              Survey figures are taken from reports published by the National Institutes of Health, Ministry of Health
              Malaysia, whose site states that it holds the copyright; no open licence was found for them. They are
              credited to their source here and are not re-licensed. Please ask NIH before reusing them.
            </li>
            <li>
              <span className="font-medium text-ink-primary">Name and logo.</span> The names "Malaysia Health Equity
              Observatory" and "MY-HEO" and the logo are not covered by the MIT licence and may not be used to present a
              modified version as the official observatory.
            </li>
            <li>
              <span className="font-medium text-ink-primary">This page and the documentation.</span> The text of this
              page and of the methodology documents may be shared and adapted under{" "}
              <ExtLink href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</ExtLink>, with credit.
            </li>
          </ul>
          <P>
            MY-HEO is an independent research project. It is not an official product of DOSM, the Ministry of Health or
            the Government of Malaysia.
          </P>
        </section>

        {/* 6. Contact & feedback */}
        <section aria-labelledby="m-contact">
          <H2 id="m-contact">6. Contact &amp; Feedback</H2>
          <dl className="mb-4 space-y-4 text-sm leading-relaxed text-ink-secondary">
            <div>
              <dt className="font-medium text-ink-primary">Principal Investigator</dt>
              <dd className="mt-0.5">
                <p>Pauline Yeoh, Dr / Lecturer</p>
                <p>School of Engineering, Monash Universiti Malaysia</p>
                <p>
                  <span aria-hidden="true">✉️ </span>
                  <a href="mailto:pauline.yeoh@monash.edu" className="text-series-1 underline underline-offset-2">
                    pauline.yeoh@monash.edu
                  </a>
                </p>
              </dd>
            </div>
            <div>
              <dt className="font-medium text-ink-primary">Project Team &amp; Collaborators</dt>
              <dd className="mt-0.5">Developed as part of the MERCi initiative.</dd>
            </div>
          </dl>
          <P>
            This is a research and public-interest prototype built entirely from public open government data
            published by DOSM, the Ministry of Health Malaysia, and the National Registration Department. For
            full source-level provenance on any individual figure shown anywhere on this dashboard, see the{" "}
            <a href="#/explorer" className="text-series-1 underline underline-offset-2">
              Data Explorer
            </a>{" "}
            page.
          </P>
        </section>

        {/* 7. Glossary */}
        <section aria-labelledby="m-glossary">
          <H2 id="m-glossary">7. Glossary</H2>
          <P>
            Quick definitions for terms used across this dashboard's charts and KPI tiles. Hovering (or tapping, on
            touch devices) a dotted-underlined term anywhere on the site links back to its entry here.
          </P>
          <dl className="space-y-3">
            {Object.values(GLOSSARY).map((entry) => (
              <div key={entry.id} id={`glossary-${entry.id}`} className="scroll-mt-6 border-b border-line-grid pb-3 last:border-b-0">
                <dt className="text-sm font-medium text-ink-primary">{entry.term}</dt>
                <dd className="mt-0.5 text-sm leading-relaxed text-ink-secondary">{entry.definition}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>
    </div>
  );
}
