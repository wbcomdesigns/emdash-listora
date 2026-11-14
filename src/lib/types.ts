import { asRecord, asString } from "./util";

/** The six kinds of extra field a listing type can have (SCOPE.md decisions). */
export const FIELD_KINDS = ["text", "number", "choice", "link", "date", "yesno"] as const;
export type FieldKind = (typeof FIELD_KINDS)[number];

export type TypeField = {
	key: string;
	label: string;
	kind: FieldKind;
	/** The choices of a `choice` field. */
	options?: string[];
	required?: boolean;
	/** Shown on directory cards as well as the listing page. */
	cards?: boolean;
	/** The sort slot (`n1` to `n3` in the directory index) a number or date field fills. */
	slot?: 1 | 2 | 3;
};

export type ListingType = {
	slug: string;
	name: string;
	schemaType: string;
	color: string;
	icon: string;
	/** Off: no map, city, hours, directions, Open or Closed, location search or address. */
	location: boolean;
	/** Hidden types are not offered for new listings; listings that have one still show it. */
	hidden: boolean;
	/** Built-in types can be edited and hidden, never deleted. */
	builtin: boolean;
	fields: TypeField[];
};

const builtin = (slug: string, name: string, schemaType: string, color: string, icon: string, fields: TypeField[], location = true): ListingType => ({
	slug,
	name,
	schemaType,
	color,
	icon,
	location,
	hidden: false,
	builtin: true,
	fields,
});

const choice = (key: string, label: string, options: string[], extra: Partial<TypeField> = {}): TypeField => ({ key, label, kind: "choice", options, ...extra });

/**
 * The built-in types: the 10 WordPress Listora Free defaults plus Software. Seeded from here on every
 * read; an owner's changes (settings key `types`) are laid over them, so a new built-in or a fix to one
 * reaches every site without a data step.
 */
export const BUILTIN_TYPES: readonly ListingType[] = [
	builtin("business", "Business", "LocalBusiness", "#2563EB", "building-2", [{ key: "year_founded", label: "Year founded", kind: "text" }]),
	builtin("restaurant", "Restaurant", "Restaurant", "#DC2626", "utensils", [
		{ key: "cuisine", label: "Cuisine", kind: "text" },
		choice("price_range", "Price range", ["$", "$$", "$$$", "$$$$"]),
	]),
	builtin("real-estate", "Real estate", "Residence", "#16A34A", "home", [
		{ key: "beds", label: "Bedrooms", kind: "number" },
		{ key: "baths", label: "Bathrooms", kind: "number" },
		{ key: "price", label: "Price", kind: "text" },
	]),
	builtin("hotel", "Hotel", "Hotel", "#DB2777", "hotel", [{ key: "star_rating", label: "Stars", kind: "number" }]),
	builtin("event", "Event", "Event", "#7C3AED", "calendar", [
		{ key: "event_start", label: "Starts", kind: "text" },
		{ key: "event_end", label: "Ends", kind: "text" },
	]),
	builtin("job", "Job", "JobPosting", "#0D9488", "briefcase", [
		{ key: "salary", label: "Salary", kind: "text" },
		{ key: "job_type", label: "Job type", kind: "text" },
	]),
	builtin("healthcare", "Healthcare", "MedicalBusiness", "#0284C7", "heart-pulse", [{ key: "specialty", label: "Specialty", kind: "text" }]),
	builtin("education", "Education", "EducationalOrganization", "#CA8A04", "graduation-cap", [{ key: "program", label: "Program", kind: "text" }]),
	builtin("place", "Place", "Place", "#059669", "map-pin", [{ key: "place_kind", label: "Kind of place", kind: "text" }]),
	builtin("classified", "Classified", "Offer", "#EA580C", "tag", [{ key: "asking_price", label: "Asking price", kind: "text" }]),
	// Fields only in 0.8.0 step 2; its card and page sections come with step 7 (SCOPE.md item 9).
	builtin(
		"software",
		"Software",
		"SoftwareApplication",
		"#4F46E5",
		"code",
		[
			choice("what_it_is", "What it is", ["Plugin", "Skill", "Agent", "MCP server", "App", "Library", "Theme"], { cards: true }),
			choice("works_with", "Works with", ["WordPress", "EmDash", "Claude Code", "Cursor", "VS Code", "npm", "Python", "Any"], { cards: true }),
			{ key: "repository", label: "Repository", kind: "link" },
			{ key: "homepage", label: "Homepage or docs", kind: "link" },
			{ key: "install_command", label: "Install command", kind: "text" },
			{ key: "version", label: "Version", kind: "text" },
			choice("license", "License", ["MIT", "GPL", "Apache", "BSD", "Proprietary", "Other"]),
			choice("price", "Price", ["Free", "Freemium", "Paid"], { cards: true }),
			{ key: "open_source", label: "Open source", kind: "yesno" },
			{ key: "stars", label: "Stars or installs", kind: "number", slot: 1 },
			{ key: "last_release", label: "Last release", kind: "date", slot: 2 },
			{ key: "released", label: "Released", kind: "date", slot: 3 },
		],
		false,
	),
];

/** The settings key that holds the owner's types: changes to built-ins and every custom type. */
export const TYPES_KEY = "types";

const text = (value: unknown, max: number) => asString(value).trim().slice(0, max);
const COLOR = /^#[0-9a-f]{6}$/i;
const SLUG = /^[a-z0-9][a-z0-9-]{0,39}$/;

function fieldOf(raw: unknown): TypeField | null {
	const row = asRecord(raw);
	const key = text(row.key, 40);
	const label = text(row.label, 80);
	const kind = FIELD_KINDS.find((item) => item === row.kind);
	if (!/^[a-z0-9_]+$/.test(key) || !label || !kind) return null;
	const field: TypeField = { key, label, kind };
	if (kind === "choice") field.options = (Array.isArray(row.options) ? row.options : []).map((option) => text(option, 80)).filter(Boolean).slice(0, 30);
	if (row.required === true) field.required = true;
	if (row.cards === true) field.cards = true;
	if ((kind === "number" || kind === "date") && (row.slot === 1 || row.slot === 2 || row.slot === 3)) field.slot = row.slot;
	return field;
}

/** One stored type laid over its base (the built-in with that slug, if any). Unusable entries are dropped. */
function typeOf(raw: unknown, base?: ListingType): ListingType | null {
	const row = asRecord(raw);
	const slug = base?.slug ?? text(row.slug, 40);
	if (!SLUG.test(slug)) return null;
	const name = text(row.name, 60) || base?.name || "";
	if (!name) return null;
	return {
		slug,
		name,
		schemaType: /^[A-Za-z]{2,40}$/.test(asString(row.schemaType)) ? asString(row.schemaType) : (base?.schemaType ?? "Thing"),
		color: COLOR.test(asString(row.color)) ? asString(row.color) : (base?.color ?? "#64748B"),
		icon: /^[a-z0-9-]{1,40}$/.test(asString(row.icon)) ? asString(row.icon) : (base?.icon ?? "tag"),
		location: typeof row.location === "boolean" ? row.location : (base?.location ?? true),
		hidden: typeof row.hidden === "boolean" ? row.hidden : false,
		builtin: Boolean(base),
		fields: Array.isArray(row.fields) ? row.fields.map(fieldOf).filter((field): field is TypeField => field !== null) : (base?.fields ?? []),
	};
}

/**
 * Every listing type on this site: the built-ins in their order with the owner's changes laid over
 * them, then the owner's own types in the order they were added. `stored` is the settings value under
 * TYPES_KEY (an array of types by slug); anything unreadable in it is skipped, never thrown.
 */
export function typesFrom(stored: unknown): ListingType[] {
	const saved = (Array.isArray(stored) ? stored : []).map(asRecord);
	const bySlug = new Map(saved.map((row) => [asString(row.slug), row]));
	const types = BUILTIN_TYPES.map((base) => (bySlug.has(base.slug) ? (typeOf(bySlug.get(base.slug), base) ?? base) : base));
	const known = new Set(types.map((type) => type.slug));
	for (const row of saved) {
		const custom = known.has(asString(row.slug)) ? null : typeOf(row);
		if (custom) {
			types.push(custom);
			known.add(custom.slug);
		}
	}
	return types;
}

/**
 * The type a listing's stored slug names. A slug no type has (a deleted custom type, a typo in an
 * import from an older version) shows as the slug itself, never as another type. An empty slug is
 * a listing saved before it had a type: Business, as it always was.
 */
export function typeBySlug(types: readonly ListingType[], slug: unknown): ListingType {
	const wanted = asString(slug) || "business";
	return (
		types.find((type) => type.slug === wanted) ?? {
			slug: wanted,
			name: wanted,
			schemaType: "Thing",
			color: "#64748B",
			icon: "tag",
			location: true,
			hidden: true,
			builtin: false,
			fields: [],
		}
	);
}

/** The types offered for a new listing. */
export const shownTypes = (types: readonly ListingType[]) => types.filter((type) => !type.hidden);

export const LISTINGS = "listings";
export const DEMO_MEMBER = "demo-member";

/** The owner-notice task runs once an hour. */
export const NOTIFY_CRON = "7 * * * *";

/**
 * Owner decision still open (issue #83): does a listing a member added count as claimed by them?
 * true (the recommended default): the member who added it is its owner, the listing shows as a
 * claimed listing, and nobody else can file a claim on it. false: it shows the claim box to everyone
 * else until an admin approves someone's claim (which then moves the listing to them). Either way
 * the owner never sees Claim or Write a review on their own listing.
 */
export const SUBMITTER_IS_OWNER = true;
