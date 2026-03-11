/**
 * Database seed script.
 * Seeds holidays (Colombian 2026, commercial, lunar/custom) and two sites.
 *
 * Usage: npx tsx prisma/seed.ts
 */

import { PrismaClient, HolidayType } from "@prisma/client";

const prisma = new PrismaClient();

interface HolidaySeed {
  date: string; // YYYY-MM-DD
  name: string;
  country: string;
  type: HolidayType;
}

// ── Colombian National Holidays 2026 ────────────────────────

const colombianHolidays2026: HolidaySeed[] = [
  { date: "2026-01-01", name: "Año Nuevo", country: "CO", type: "national" },
  { date: "2026-01-12", name: "Día de los Reyes Magos", country: "CO", type: "national" },
  { date: "2026-03-23", name: "Día de San José", country: "CO", type: "national" },
  { date: "2026-03-29", name: "Domingo de Ramos", country: "CO", type: "national" },
  { date: "2026-04-02", name: "Jueves Santo", country: "CO", type: "national" },
  { date: "2026-04-03", name: "Viernes Santo", country: "CO", type: "national" },
  { date: "2026-04-05", name: "Domingo de Resurrección", country: "CO", type: "national" },
  { date: "2026-05-01", name: "Día del Trabajo", country: "CO", type: "national" },
  { date: "2026-05-18", name: "Día de la Ascensión", country: "CO", type: "national" },
  { date: "2026-06-08", name: "Corpus Christi", country: "CO", type: "national" },
  { date: "2026-06-15", name: "Sagrado Corazón de Jesús", country: "CO", type: "national" },
  { date: "2026-06-29", name: "San Pedro y San Pablo", country: "CO", type: "national" },
  { date: "2026-07-20", name: "Día de la Independencia", country: "CO", type: "national" },
  { date: "2026-08-07", name: "Batalla de Boyacá", country: "CO", type: "national" },
  { date: "2026-08-17", name: "Asunción de la Virgen", country: "CO", type: "national" },
  { date: "2026-10-12", name: "Día de la Raza", country: "CO", type: "national" },
  { date: "2026-11-02", name: "Día de Todos los Santos", country: "CO", type: "national" },
  { date: "2026-11-16", name: "Independencia de Cartagena", country: "CO", type: "national" },
  { date: "2026-12-08", name: "Día de la Inmaculada Concepción", country: "CO", type: "national" },
  { date: "2026-12-25", name: "Navidad", country: "CO", type: "national" },
  { date: "2026-05-10", name: "Día de la Madre", country: "CO", type: "national" },
  { date: "2026-06-21", name: "Día del Padre", country: "CO", type: "national" },
];

// ── Commercial Holidays ─────────────────────────────────────

const commercialHolidays: HolidaySeed[] = [
  { date: "2026-02-14", name: "San Valentín", country: "INTL", type: "commercial" },
  { date: "2026-09-19", name: "Día del Amor y la Amistad", country: "CO", type: "commercial" },
  { date: "2026-10-31", name: "Halloween", country: "INTL", type: "commercial" },
  { date: "2026-11-27", name: "Black Friday", country: "INTL", type: "commercial" },
  { date: "2026-11-30", name: "Cyber Monday", country: "INTL", type: "commercial" },
  { date: "2026-12-24", name: "Nochebuena", country: "CO", type: "commercial" },
  { date: "2026-12-31", name: "Año Viejo", country: "CO", type: "commercial" },
  { date: "2026-03-08", name: "Día Internacional de la Mujer", country: "INTL", type: "commercial" },
  { date: "2026-06-01", name: "Día del Niño (Colombia)", country: "CO", type: "commercial" },
];

// ── Lunar / Custom Dates ────────────────────────────────────

const lunarAndCustomDates: HolidaySeed[] = [
  { date: "2026-01-29", name: "Año Nuevo Lunar", country: "INTL", type: "lunar" },
  { date: "2026-03-29", name: "Eclipse Solar Total", country: "INTL", type: "lunar" },
  { date: "2026-09-28", name: "Superluna de Cosecha", country: "INTL", type: "lunar" },
  { date: "2026-04-22", name: "Día de la Tierra", country: "INTL", type: "custom" },
  { date: "2026-06-05", name: "Día Mundial del Medio Ambiente", country: "INTL", type: "custom" },
];

// ── Sites ───────────────────────────────────────────────────

async function seedSites() {
  const alquilerCarro = await prisma.site.upsert({
    where: { domain: "alquilercarrobogota.com" },
    update: {},
    create: {
      domain: "alquilercarrobogota.com",
      name: "Alquiler Carro Bogotá",
      platform: "wordpress",
      apiUrl: "https://alquilercarrobogota.com/wp-json",
      postsPerDay: 1,
      minWords: 1500,
      maxWords: 2500,
      windowStart: 7,
      windowEnd: 12,
      conversionUrl: "https://alquilercarrobogota.com/reservar",
      authoritativeSources: [
        "https://www.mintransporte.gov.co",
        "https://www.movilidadbogota.gov.co",
      ],
      active: true,
    },
  });

  const estrategias = await prisma.site.upsert({
    where: { domain: "estrategias.us" },
    update: {},
    create: {
      domain: "estrategias.us",
      name: "Estrategias US",
      platform: "custom",
      apiUrl: "https://api.estrategias.us/v1",
      postsPerDay: 2,
      minWords: 1200,
      maxWords: 2000,
      windowStart: 8,
      windowEnd: 14,
      conversionUrl: "https://estrategias.us/contacto",
      authoritativeSources: [
        "https://www.sba.gov",
        "https://www.irs.gov",
      ],
      active: true,
    },
  });

  return { alquilerCarro, estrategias };
}

// ── Main Seed ───────────────────────────────────────────────

async function main() {
  console.log("Seeding holidays...");

  const allHolidays = [
    ...colombianHolidays2026,
    ...commercialHolidays,
    ...lunarAndCustomDates,
  ];

  const createdHolidays: { id: string; name: string }[] = [];

  for (const h of allHolidays) {
    const holiday = await prisma.holiday.upsert({
      where: {
        date_name_country: {
          date: new Date(h.date),
          name: h.name,
          country: h.country,
        },
      },
      update: {},
      create: {
        date: new Date(h.date),
        name: h.name,
        country: h.country,
        type: h.type,
      },
    });
    createdHolidays.push({ id: holiday.id, name: holiday.name });
  }

  console.log(`  Created/verified ${createdHolidays.length} holidays.`);

  console.log("Seeding sites...");
  const { alquilerCarro, estrategias } = await seedSites();
  console.log(`  Site: ${alquilerCarro.domain} (${alquilerCarro.platform})`);
  console.log(`  Site: ${estrategias.domain} (${estrategias.platform})`);

  // Activate key holidays for both sites
  console.log("Activating holidays for sites...");

  const keyHolidayNames = [
    "Navidad",
    "Black Friday",
    "Cyber Monday",
    "San Valentín",
    "Día de la Madre",
    "Día de la Independencia",
    "Semana Santa", // Will match Jueves/Viernes Santo
  ];

  // Also activate Semana Santa individual days
  const semanaNames = ["Jueves Santo", "Viernes Santo", "Domingo de Ramos", "Domingo de Resurrección"];

  const holidaysToActivate = createdHolidays.filter(
    (h) =>
      keyHolidayNames.includes(h.name) || semanaNames.includes(h.name),
  );

  for (const h of holidaysToActivate) {
    for (const site of [alquilerCarro, estrategias]) {
      await prisma.siteHoliday.upsert({
        where: {
          siteId_holidayId: { siteId: site.id, holidayId: h.id },
        },
        update: {},
        create: {
          siteId: site.id,
          holidayId: h.id,
          daysInAdvance: h.name.includes("Black Friday") || h.name.includes("Cyber Monday") ? 20 : 15,
        },
      });
    }
  }

  console.log(`  Activated ${holidaysToActivate.length} holidays for each site.`);
  console.log("Seed complete.");
}

main()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
