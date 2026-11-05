import { buildConfig, type Access } from "payload";
import { postgresAdapter } from "@payloadcms/db-postgres";
import { lexicalEditor } from "@payloadcms/richtext-lexical";
import { requireEnvSecret } from "./lib/config";

const notFieldRole: Access = ({ req }) => {
  const role = (req?.user as any)?.role;
  return Boolean(role && role !== "field");
};

const canEditContent: Access = ({ req }) => {
  const role = (req?.user as any)?.role;
  return role === "admin" || role === "editor" || role === "translator";
};

const isAdminOnly: Access = ({ req }) => {
  const role = (req?.user as any)?.role;
  return role === "admin";
};

export default buildConfig({
  secret: process.env.ADMIN_SESSION_SECRET || "payload-build-time-placeholder-secret-32chars",
  editor: lexicalEditor(),
  db: postgresAdapter({
    pool: {
      connectionString:
        process.env.DATABASE_URL || "postgresql://ezan_user:ezan_local_pass@127.0.0.1:5437/ezan_web"
    },
    schemaName: "payload"
  }),
  localization: {
    locales: [
      { label: "Türkçe", code: "tr" },
      { label: "O'zbekcha", code: "uz" },
      { label: "English", code: "en" },
      { label: "العربية", code: "ar", rtl: true }
    ],
    defaultLocale: "tr",
    fallback: true
  },
  collections: [
    {
      slug: "users",
      auth: true,
      access: {
        read: notFieldRole,
        create: isAdminOnly,
        update: isAdminOnly,
        delete: isAdminOnly
      },
      fields: [
        { name: "fullName", type: "text", required: true },
        {
          name: "role",
          type: "select",
          required: true,
          defaultValue: "editor",
          options: ["admin", "editor", "translator", "finance", "field"]
        },
        { name: "totpEnabled", type: "checkbox", defaultValue: true },
        { name: "assignedCountryCode", type: "text" }
      ]
    },
    {
      slug: "media",
      upload: {
        staticDir: "public/uploads",
        mimeTypes: ["image/*"]
      },
      access: {
        read: () => true,
        create: canEditContent,
        update: canEditContent,
        delete: isAdminOnly
      },
      fields: [
        {
          name: "alt",
          type: "text",
          required: true,
          localized: true
        }
      ]
    },
    {
      slug: "pages",
      versions: { drafts: { autosave: true, schedulePublish: true } },
      access: { read: notFieldRole, create: canEditContent, update: canEditContent, delete: isAdminOnly },
      fields: [
        { name: "slug", type: "text", required: true, unique: true },
        { name: "title", type: "text", required: true, localized: true },
        { name: "summary", type: "textarea", localized: true },
        { name: "needsReview", type: "checkbox", localized: true, defaultValue: true }
      ]
    },
    {
      slug: "projects",
      versions: { drafts: { autosave: true, schedulePublish: true } },
      access: { read: notFieldRole, create: canEditContent, update: canEditContent, delete: isAdminOnly },
      fields: [
        { name: "slug", type: "text", required: true, unique: true },
        { name: "category", type: "text", required: true },
        { name: "projectStatus", type: "select", options: ["ongoing", "completed"], defaultValue: "ongoing" },
        { name: "title", type: "text", required: true, localized: true },
        { name: "summary", type: "textarea", localized: true },
        { name: "needsReview", type: "checkbox", localized: true, defaultValue: true }
      ]
    },
    {
      slug: "campaigns",
      versions: { drafts: { autosave: true, schedulePublish: true } },
      access: { read: notFieldRole, create: canEditContent, update: canEditContent, delete: isAdminOnly },
      fields: [
        { name: "slug", type: "text", required: true, unique: true },
        { name: "purposeCode", type: "text", required: true, unique: true },
        { name: "restricted", type: "checkbox", defaultValue: true },
        { name: "targetAmount", type: "number", defaultValue: 0 },
        { name: "collectedAmount", type: "number", defaultValue: 0 },
        { name: "minAmount", type: "number", defaultValue: 50 },
        { name: "maxAmount", type: "number", defaultValue: 5000000 },
        { name: "title", type: "text", required: true, localized: true },
        { name: "summary", type: "textarea", localized: true },
        { name: "needsReview", type: "checkbox", localized: true, defaultValue: true }
      ]
    },
    {
      slug: "news",
      versions: { drafts: { autosave: true, schedulePublish: true } },
      access: { read: notFieldRole, create: canEditContent, update: canEditContent, delete: isAdminOnly },
      fields: [
        { name: "slug", type: "text", required: true, unique: true },
        { name: "category", type: "text", defaultValue: "general" },
        { name: "title", type: "text", required: true, localized: true },
        { name: "excerpt", type: "textarea", localized: true },
        { name: "needsReview", type: "checkbox", localized: true, defaultValue: true }
      ]
    },
    {
      slug: "videos",
      access: { read: notFieldRole, create: canEditContent, update: canEditContent, delete: isAdminOnly },
      fields: [
        { name: "youtubeId", type: "text", required: true },
        { name: "category", type: "text", defaultValue: "general" },
        { name: "title", type: "text", required: true, localized: true },
        { name: "needsReview", type: "checkbox", localized: true, defaultValue: true }
      ]
    },
    {
      slug: "reports",
      access: { read: notFieldRole, create: canEditContent, update: canEditContent, delete: isAdminOnly },
      fields: [
        { name: "year", type: "number", required: true },
        { name: "title", type: "text", required: true, localized: true },
        { name: "fileUrl", type: "text" },
        { name: "needsReview", type: "checkbox", localized: true, defaultValue: true }
      ]
    },
    {
      slug: "faqs",
      access: { read: notFieldRole, create: canEditContent, update: canEditContent, delete: isAdminOnly },
      fields: [
        { name: "category", type: "text", defaultValue: "general" },
        { name: "question", type: "text", required: true, localized: true },
        { name: "answer", type: "textarea", required: true, localized: true },
        { name: "needsReview", type: "checkbox", localized: true, defaultValue: true }
      ]
    },
    {
      slug: "team",
      access: { read: notFieldRole, create: canEditContent, update: canEditContent, delete: isAdminOnly },
      fields: [
        { name: "fullName", type: "text", required: true },
        { name: "roleTitle", type: "text", required: true, localized: true },
        { name: "needsReview", type: "checkbox", localized: true, defaultValue: true }
      ]
    },
    {
      slug: "kurbanSeasons",
      access: {
        read: ({ req }) => Boolean(req?.user),
        create: canEditContent,
        update: canEditContent,
        delete: isAdminOnly
      },
      fields: [
        { name: "year", type: "number", required: true, unique: true },
        { name: "eidDay1", type: "date" },
        { name: "eidDay2", type: "date" },
        { name: "eidDay3", type: "date" },
        { name: "eidDay4", type: "date" },
        { name: "salesOpenAt", type: "date" },
        { name: "salesCloseAt", type: "date" },
        { name: "isActive", type: "checkbox", defaultValue: false },
        { name: "vekaletVersion", type: "text", defaultValue: "v2027.1-taslik" },
        { name: "vekaletText", type: "textarea", localized: true }
      ]
    },
    {
      slug: "kurbanCountries",
      access: {
        read: ({ req }) => Boolean(req?.user),
        create: canEditContent,
        update: canEditContent,
        delete: isAdminOnly
      },
      fields: [
        { name: "code", type: "text", required: true, unique: true },
        { name: "flag", type: "text", defaultValue: "🏳️" },
        { name: "partnerInternal", type: "text" },
        { name: "isActive", type: "checkbox", defaultValue: false },
        { name: "name", type: "text", required: true, localized: true },
        { name: "description", type: "textarea", localized: true },
        { name: "needsReview", type: "checkbox", localized: true, defaultValue: true }
      ]
    },
    {
      slug: "kurbanOffers",
      access: {
        read: ({ req }) => Boolean(req?.user),
        create: canEditContent,
        update: canEditContent,
        delete: isAdminOnly
      },
      fields: [
        { name: "seasonYear", type: "number", required: true },
        { name: "countryCode", type: "text", required: true },
        { name: "animalType", type: "select", required: true, options: ["sheep", "goat", "cattle", "camel"] },
        { name: "sharesPerAnimal", type: "number", required: true, defaultValue: 1 },
        { name: "pricePerShareTry", type: "number", required: true, defaultValue: 0 },
        { name: "quotaShares", type: "number", required: true, defaultValue: 0 },
        { name: "soldShares", type: "number", defaultValue: 0, admin: { readOnly: true } },
        { name: "isActive", type: "checkbox", defaultValue: false }
      ]
    }
  ],
  globals: [
    {
      slug: "siteSettings",
      access: {
        read: notFieldRole,
        update: isAdminOnly
      },
      fields: [
        { name: "foundationName", type: "text", localized: true },
        { name: "announcementText", type: "text", localized: true }
      ]
    }
  ]
});
