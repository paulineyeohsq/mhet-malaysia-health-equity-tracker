import PageHeader from "../components/PageHeader";

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

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded bg-line-grid/60 px-1.5 py-0.5 font-mono text-[0.85em] text-ink-primary">
      {children}
    </code>
  );
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

export default function Methodology() {
  return (
    <div>
      <PageHeader
        title="Methodology"
        subtitle="How every figure on this dashboard was sourced, cleaned, standardised and calculated — and what its limits are."
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
            an assumption the pipeline is not confident in, the dashboard shows "No data" rather than a guess. This
            page documents exactly how that pipeline works, so a researcher can verify or reproduce any figure
            shown.
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
            As of this build, the project's{" "}
            <ExtLink href="https://data.gov.my/data-catalogue">dataset inventory</ExtLink> documents{" "}
            <span className="font-medium text-ink-primary">24 datasets that have been fully ingested</span> — with
            raw files under <Code>data/raw/</Code> and processed outputs under <Code>data/processed/</Code>,
            produced by the pipeline described below — and{" "}
            <span className="font-medium text-ink-primary">
              9 additional datasets that were identified and schema-verified but not yet ingested
            </span>{" "}
            into this build (for example, income-percentile microdata that would be needed for a concentration-index
            calculation, and the live 2020–2024 district population series, whose raw file exceeded the sandboxed
            environment's single-request fetch-size limit during this build). Every dataset — ingested or not, with
            its exact catalogue URL, date range, geographic resolution, known missingness and stated limitations —
            is itemised on the{" "}
            <a href="#/explorer" className="text-series-1 underline underline-offset-2">
              Data Explorer
            </a>{" "}
            page, which reads directly from the same machine-readable inventory used to write this page.
          </P>
        </section>

        {/* 3. ETL pipeline */}
        <section aria-labelledby="m-pipeline">
          <H2 id="m-pipeline">3. ETL pipeline and reproducibility</H2>
          <P>
            This dashboard is a <span className="font-medium text-ink-primary">static site</span>: there is no live
            backend, no database and no server-side query layer. All computation that requires trust — cleaning,
            standardising and joining government data — happens ahead of time in a Python ETL pipeline, and the
            frontend (this React application) only ever reads the resulting static JSON files at{" "}
            <Code>frontend/public/data/</Code>. This is a deliberate architecture choice: it keeps every
            transformation inspectable in version-controlled Python, and the resulting site is deployable to any
            static host.
          </P>
          <P>
            Raw source files and processed analytical files are kept in strictly separate directories —{" "}
            <Code>data/raw/</Code> holds the untouched CSVs and GeoJSON as fetched from data.gov.my's API and
            storage endpoints or the DOSM GitHub mirror, and <Code>data/processed/</Code> holds only files produced
            by the scripts below. Nothing in <Code>data/raw/</Code> is ever hand-edited.
          </P>
          <P>The pipeline runs in four stages, each a standalone, re-runnable Python script under <Code>scripts/</Code>:</P>
          <ol className="mb-3 list-decimal space-y-2 pl-5 text-sm leading-relaxed text-ink-secondary marker:text-series-1">
            <li>
              <span className="font-medium text-ink-primary">
                Validate — <Code>scripts/validate_data.py</Code>
              </span>
              . Checks every raw dataset for schema and column presence, non-numeric values in numeric columns,
              missingness, duplicate records, values outside a plausible range for the metric (e.g. a Gini
              coefficient outside 0–1, a percentage outside 0–100), state/district name standardisation, and
              temporal coverage gaps. This script never modifies or drops data — it only produces one Markdown
              report per dataset under <Code>data/validation_reports/</Code>. Any actual cleaning happens
              separately, and explicitly, in the transform step.
            </li>
            <li>
              <span className="font-medium text-ink-primary">
                Build geography — <Code>scripts/build_geo_lookup.py</Code>
              </span>
              . Produces the canonical state/district lookup table used to join every other dataset to a
              geography.
            </li>
            <li>
              <span className="font-medium text-ink-primary">
                Transform — <Code>scripts/transform_data.py</Code>
              </span>
              . Cleans, standardises and reshapes each raw CSV into the master analytical JSON files the frontend
              consumes, applying the geographic and temporal harmonisation described in the next section.
            </li>
          </ol>
          <P>
            All geographic name standardisation logic lives in a shared module, <Code>scripts/geo_utils.py</Code>,
            imported by both the validation and transform scripts, so the same canonical spelling is enforced
            everywhere in the pipeline rather than duplicated per-script.
          </P>
          <P>
            To reproduce or update the dashboard end-to-end, see{" "}
            <a href="#m-reproduce" className="text-series-1 underline underline-offset-2">
              section 10
            </a>{" "}
            below. A scheduled workflow under <Code>.github/workflows/</Code> is part of the project's design for
            periodic automated re-ingestion and rebuilding as DOSM and MOH publish new survey years.
          </P>
        </section>

        {/* 4. Geographic harmonisation */}
        <section aria-labelledby="m-geo">
          <H2 id="m-geo">4. Geographic harmonisation</H2>
          <P>
            Different data.gov.my and DOSM datasets spell the same state or district differently — for example
            "Penang" and "P.Pinang" both refer to the official state name{" "}
            <span className="font-medium text-ink-primary">Pulau Pinang</span>, "WP Kuala Lumpur" and "Kuala Lumpur"
            both refer to <span className="font-medium text-ink-primary">W.P. Kuala Lumpur</span>, and at the
            district level, source files use forms like "Kulai" for the official district name{" "}
            <span className="font-medium text-ink-primary">Kulaijaya</span>, or parenthetical forms like
            "Kinta (Ipoh)" for the official district <span className="font-medium text-ink-primary">Kinta</span>{" "}
            and "Larut &amp; Matang (Taiping)" for{" "}
            <span className="font-medium text-ink-primary">Larut dan Matang</span>. <Code>geo_utils.py</Code>{" "}
            defines one canonical spelling per geography — the 16 official Malaysian states (the 13 states plus the
            three Federal Territories: Kuala Lumpur, Labuan and Putrajaya), matched exactly against the{" "}
            <Code>state</Code> property in DOSM's own{" "}
            <ExtLink href="https://github.com/dosm-malaysia/data-open">administrative boundary GeoJSON</ExtLink> —
            plus an explicit alias table mapping every alternate spelling actually observed in the source files
            (not a fuzzy-matching heuristic) to that canonical name. Every transform in{" "}
            <Code>transform_data.py</Code> passes state and district fields through{" "}
            <Code>canonical_state()</Code> / <Code>canonical_district()</Code> before writing output, so all
            processed tables join cleanly on identical keys. No name mapping in this module invents a location —
            it only standardises the spelling of names that already appear, verbatim, somewhere in the raw data.
          </P>
          <P>
            "Malaysia" aggregate rows present in several state-level source files are deliberately split out into
            separate national-level output files during the transform step — they are never treated as a
            17th state alongside the real 16, which would silently distort any state-level ranking or map.
          </P>
          <P>
            District and state map coordinates are not hand-entered. <Code>scripts/build_geo_lookup.py</Code> loads
            DOSM's official administrative boundary polygons (<Code>administrative_1_state.geojson</Code> and{" "}
            <Code>administrative_2_district.geojson</Code>, sourced from the DOSM GitHub mirror) and computes the
            geometric centroid of every state and district polygon using the <Code>shapely</Code> Python library.
            These centroids — used for map labelling and point placement — are therefore genuinely derived from
            official government-published boundary geometry, not approximated or looked up from an external
            gazetteer.
          </P>
        </section>

        {/* 5. Data quality & missing-data policy */}
        <section aria-labelledby="m-quality">
          <H2 id="m-quality">5. Data quality and missing-data policy</H2>
          <P>
            The pipeline enforces one non-negotiable rule end to end:{" "}
            <span className="font-medium text-ink-primary">
              a missing or blank value in the source data is always written as JSON <Code>null</Code>
            </span>
            , and the frontend always renders a <Code>null</Code> as "No data" (or "—" in compact table cells) —
            never as 0, and never filled in by interpolation or estimation. A literal 0 is only ever written when
            the source file itself contains the value 0 (for example, a district genuinely reporting zero hospital
            beds is recorded as 0; a district the source simply didn't report for that year is recorded as{" "}
            <Code>null</Code>). This distinction matters for a health-equity dashboard specifically because
            conflating "no hospital" with "no data" would misrepresent exactly the kind of infrastructure gap the
            dashboard exists to surface.
          </P>
          <P>Two concrete examples of this policy in practice, visible elsewhere on this dashboard:</P>
          <ul className="mb-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-ink-secondary marker:text-series-1">
            <li>
              District-level basic amenities data (piped water, electricity and sanitation access) was ingested
              only for the 2022 cross-section, even though the source dataset spans 2016–2024. Earlier and later
              years render as "No data" for district amenities rather than being estimated or carried forward from
              the nearest available year.
            </li>
            <li>
              District-level hospital bed counts for 2022 are shown on the Healthcare Access page as an{" "}
              <span className="font-medium text-ink-primary">absolute count</span>, not a per-100,000-population
              rate, because no matching 2022 district-level population denominator exists anywhere in this
              pipeline (the live 2020–2024 district population series was one of the datasets not yet ingested —
              see section 2). Computing a rate anyway would mean silently dividing a 2022 numerator by an older
              census-year denominator from a different year, which the pipeline treats as fabricating a number
              rather than reporting one — so it is not done, and the page states this explicitly next to the
              figure.
            </li>
          </ul>
        </section>

        {/* 6. Inequality measures */}
        <section aria-labelledby="m-measures">
          <H2 id="m-measures">6. Inequality measures and their assumptions</H2>
          <P>
            Different ways of describing a gap between groups carry different levels of statistical assumption,
            and this dashboard is deliberate about which ones it shows where:
          </P>
          <ul className="mb-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-ink-secondary marker:text-series-1">
            <li>
              <span className="font-medium text-ink-primary">Absolute and relative differences</span> (e.g. "the
              gap between the highest- and lowest-poverty state is 18 percentage points", or "State A's rate is
              2.3× State B's") are always valid, assumption-free comparisons of the numbers as reported, and are
              used freely throughout the dashboard — in state rankings, choropleth maps and key-findings summaries.
            </li>
            <li>
              <span className="font-medium text-ink-primary">Rate ratios</span> (e.g. a district's death rate
              relative to the national rate) are similarly direct, but become noisy for small underlying counts —
              several datasets in the inventory (maternal deaths, early childhood deaths) flag exactly this: small
              annual counts per state make single-year rate comparisons volatile, especially for smaller states.
            </li>
            <li>
              <span className="font-medium text-ink-primary">
                More assumption-heavy summary measures
              </span>{" "}
              — such as the Slope Index of Inequality (SII), the Relative Index of Inequality (RII), and the
              Concentration Index — rank geographic units by a socioeconomic variable (such as income) and fit a
              population-weighted regression of a health outcome against that rank. These are more statistically
              informative than a simple gap, but only valid when their assumptions genuinely hold: a
              population-weighted linear (or rank-based) relationship, adequate sample size across the ranking, and
              a socioeconomic ranking variable that is actually available at the same geographic resolution and
              year as the outcome.
            </li>
          </ul>
          <P>
            The{" "}
            <a href="#/analytics" className="text-series-1 underline underline-offset-2">
              Inequality Analytics
            </a>{" "}
            page presents SII/RII/Concentration-Index-style measures only where the underlying data genuinely
            supports them for a given indicator pair and year, with an explicit methodology note attached to each
            one stating the ranking variable, the year and the sample size used — and omits the measure, with a
            stated reason, wherever those conditions are not met (for example, where the two variables share no
            common survey year, or where too few states have non-null values for both).
          </P>
        </section>

        {/* 7. Correlation vs causation */}
        <section aria-labelledby="m-causation">
          <H2 id="m-causation">7. Correlation vs. causation</H2>
          <P>
            <span className="font-medium text-ink-primary">
              Every correlation, regression line, Pearson r, Spearman ρ or r² value shown anywhere on this
              dashboard — including on the Socioeconomic Inequality page's socioeconomic-vs-health-outcome
              scatterplot — describes a cross-sectional, ecological statistical association only.
            </span>{" "}
            "Ecological" here means the unit of analysis is a state (or district) in a single year, not an
            individual person: a positive association between, say, state-level poverty and a state-level
            mortality rate says that states with higher poverty tend to also have higher mortality in that year — it
            says nothing about any individual resident, and it is not adjusted for confounding factors such as
            urbanisation, age structure, healthcare capacity or reporting practices that could plausibly drive both
            variables at once. No result on this dashboard should be read, cited or reported as a causal claim.
            Where this dashboard's own pages display a correlation statistic, they carry this same caveat directly
            next to the chart.
          </P>
        </section>

        {/* 8. Composite index decision */}
        <section aria-labelledby="m-composite">
          <H2 id="m-composite">8. Why there is no composite Health Equity Index</H2>
          <P>
            This dashboard does not compute or display a single composite "equity score" that combines income,
            poverty, healthcare access and health outcomes into one number per state or district — a decision
            stated explicitly on the Overview page's key-findings section. A defensible composite index requires a
            justified choice of which domains to include, a normalisation method, an explicit and justified
            weighting scheme across domains, and a sensitivity analysis showing the ranking doesn't just reflect
            arbitrary weight choices. None of those choices can be made neutrally from the data alone — each one
            embeds a value judgement about which dimension of inequity matters more, and a wrong or unstated
            weighting can quietly reverse a jurisdiction's ranking. Rather than presenting a single number that
            would look authoritative while resting on an arbitrary weighting the dashboard cannot fully justify,
            this build instead presents each domain's indicators separately — income, poverty, Gini, amenities
            access, healthcare capacity, mortality and morbidity — alongside the explicit inequality measures
            described in section 6, letting a reader see which specific dimension is driving a state or district's
            standing rather than obscuring it behind a composite.
          </P>
        </section>

        {/* 9. Limitations */}
        <section aria-labelledby="m-limitations">
          <H2 id="m-limitations">9. Limitations</H2>
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
              were ingested for only one recent year rather than a full time series, because of sandboxed-environment
              data-fetch constraints encountered during this build (documented per-dataset in the inventory) —
              notably district-level hospital beds and district-level basic amenities access, both ingested for
              2022 only, even though longer series exist upstream at data.gov.my.
            </li>
            <li>
              <span className="font-medium text-ink-primary">No ethnicity–health linkage.</span> Ethnicity
              composition data is available only at the district level, from historical census tables, with no
              matching health-outcome dataset broken down by ethnicity anywhere in the sources used. Accordingly,
              no ethnicity-disaggregated health or socioeconomic analysis is presented anywhere on this
              dashboard — the Population Equity page shows ethnicity composition strictly as a standalone
              population-structure view, not fused with any outcome indicator, for exactly this reason.
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
              <span className="font-medium text-ink-primary">Poverty-line methodology changes over time.</span>{" "}
              DOSM revised its Poverty Line Income methodology around 2019; pre- and post-2019 absolute poverty
              rates are not fully comparable, and this dashboard does not adjust for that break when showing the
              national or state poverty trend line.
            </li>
          </ul>
        </section>

        {/* 10. Reproduce */}
        <section aria-labelledby="m-reproduce">
          <H2 id="m-reproduce">10. How to reproduce or update this dashboard</H2>
          <P>The full pipeline is plain Python plus a static Vite/React frontend — there is no hidden service.</P>
          <ol className="mb-3 list-decimal space-y-2 pl-5 text-sm leading-relaxed text-ink-secondary marker:text-series-1">
            <li>Clone the repository and place any updated raw source files under <Code>data/raw/</Code>.</li>
            <li>
              Run <Code>python3 scripts/validate_data.py</Code> to check the raw data and review the generated
              reports under <Code>data/validation_reports/</Code>.
            </li>
            <li>
              Run <Code>python3 scripts/build_geo_lookup.py</Code> to (re)generate the state/district geography
              lookup table and centroid coordinates from the official DOSM boundary files.
            </li>
            <li>
              Run <Code>python3 scripts/transform_data.py</Code> to clean, standardise and rebuild every master
              analytical JSON file under <Code>data/processed/</Code>.
            </li>
            <li>
              Sync the regenerated files from <Code>data/processed/</Code> into{" "}
              <Code>frontend/public/data/</Code>, then rebuild the frontend with <Code>npm run build</Code> from{" "}
              <Code>frontend/</Code>.
            </li>
          </ol>
          <P>
            For ongoing, unattended updates as DOSM and MOH publish new data, a scheduled workflow under{" "}
            <Code>.github/workflows/</Code> is part of the project's design, intended to run this same sequence of
            scripts on a recurring schedule and open a pull request with the regenerated data files for review
            before they are merged and deployed.
          </P>
        </section>

        {/* 11. Contact */}
        <section aria-labelledby="m-contact">
          <H2 id="m-contact">11. Contact and feedback</H2>
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
      </div>
    </div>
  );
}
