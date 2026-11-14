import { asNumber, asRecord, asString } from "./util";

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
	/** The type's one choice field visitors filter by with chips (`ch` in the directory index). */
	chip?: boolean;
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
			choice("what_it_is", "What it is", ["Plugin", "Skill", "Agent", "MCP server", "App", "Library", "Theme"], { cards: true, chip: true }),
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
	if (kind === "choice" && row.chip === true) field.chip = true;
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

export const SLOTS = ["n1", "n2", "n3"] as const;
export type Slot = (typeof SLOTS)[number];

/** True when the type fills this sort slot from one of its fields. */
export const mapsSlot = (type: ListingType, slot: Slot) => type.fields.some((field) => `n${field.slot}` === slot);

/**
 * A listing's sort slots (`n1` to `n3` in the directory index), from its type's field-to-slot map:
 * a number each, a date as epoch milliseconds, null when the listing has no readable value. A type
 * that maps no field gives nothing, so its index rows carry no slots at all (and an update from a
 * version without slots rewrites no row).
 */
export function slotsOf(type: ListingType, values: Record<string, unknown>): Partial<Record<Slot, number | null>> {
	const mapped = type.fields.filter((field) => field.slot);
	if (!mapped.length) return {};
	const out: Record<Slot, number | null> = { n1: null, n2: null, n3: null };
	for (const field of mapped) {
		const value = values[field.key];
		const time = field.kind === "date" && typeof value === "string" ? Date.parse(value) : null;
		out[`n${field.slot}` as Slot] = time === null ? asNumber(value) : Number.isFinite(time) ? time : null;
	}
	return out;
}

/** The type's chip field (at most one): visitors filter its listings by that choice. */
export const chipField = (type: ListingType) => type.fields.find((field) => field.chip);

/**
 * A listing's place: what a type without a location neither takes nor shows. A listing keeps what it
 * stored here when its type later loses its location; nothing shows it while the type has none.
 */
export const PLACE_FIELDS = ["address", "city", "state", "country", "postal_code", "lat", "lng", "hours"] as const;

/** The types offered for a new listing. */
export const shownTypes = (types: readonly ListingType[]) => types.filter((type) => !type.hidden);

/* ---- The fixed lists the type editor offers (value, the name an owner reads) ---- */

export const SCHEMA_TYPES: ReadonlyArray<readonly [string, string]> = [
	["LocalBusiness", "Local business"],
	["Restaurant", "Restaurant"],
	["FoodEstablishment", "Food and drink"],
	["Store", "Shop"],
	["Residence", "Home or property"],
	["Hotel", "Hotel"],
	["LodgingBusiness", "Place to stay"],
	["Event", "Event"],
	["JobPosting", "Job"],
	["MedicalBusiness", "Medical practice"],
	["EducationalOrganization", "School or college"],
	["Place", "Place"],
	["TouristAttraction", "Attraction"],
	["Offer", "Offer or classified"],
	["Product", "Product"],
	["Service", "Service"],
	["ProfessionalService", "Professional service"],
	["Organization", "Organization"],
	["SoftwareApplication", "Software"],
	["Thing", "Something else"],
];

export const TYPE_COLORS: ReadonlyArray<readonly [string, string]> = [
	["#2563EB", "Blue"],
	["#DC2626", "Red"],
	["#16A34A", "Green"],
	["#DB2777", "Pink"],
	["#7C3AED", "Purple"],
	["#0D9488", "Teal"],
	["#0284C7", "Sky blue"],
	["#0E7490", "Cyan"],
	["#CA8A04", "Gold"],
	["#059669", "Emerald"],
	["#EA580C", "Orange"],
	["#4F46E5", "Indigo"],
	["#64748B", "Slate"],
];

/** Icon names the site kit draws (site-kit/lib/listora.ts TYPE_ICONS has one drawing for each). */
export const TYPE_ICONS: ReadonlyArray<readonly [string, string]> = [
	["building-2", "Building"],
	["utensils", "Fork and knife"],
	["home", "House"],
	["hotel", "Bed"],
	["calendar", "Calendar"],
	["briefcase", "Briefcase"],
	["heart-pulse", "Medical cross"],
	["graduation-cap", "Graduation cap"],
	["map-pin", "Map pin"],
	["tag", "Price tag"],
	["code", "Code"],
	["shopping-bag", "Shopping bag"],
	["coffee", "Coffee cup"],
	["music", "Music"],
	["camera", "Camera"],
	["book", "Book"],
	["users", "People"],
	["star", "Star"],
	["wrench", "Wrench"],
	["leaf", "Leaf"],
	["globe", "Globe"],
	["heart", "Heart"],
];

export const KIND_NAMES: Record<FieldKind, string> = { text: "Text", number: "Number", choice: "Choice from a list", link: "Link", date: "Date", yesno: "Yes or no" };

/** Most fields one type may have, and most types a site may add, so the settings record stays small. */
export const MAX_FIELDS = 30;
export const MAX_CUSTOM_TYPES = 40;

/**
 * A short token for a type as it is now. Every type editor decision carries the token of the type
 * the admin was shown and is refused when the type has changed since, so two admins editing one
 * type cannot overwrite each other without knowing (FNV-1a over the type's JSON).
 */
export function typeToken(type: ListingType): string {
	const text = JSON.stringify(type);
	let hash = 0x811c9dc5;
	for (let i = 0; i < text.length; i += 1) hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193) >>> 0;
	return hash.toString(36);
}

/** A slug or field key made from a name an owner typed, unique among `taken`. */
export function keyFrom(name: string, taken: Iterable<string>, separator: "-" | "_", max: number): string {
	const base =
		name
			.toLowerCase()
			.normalize("NFKD")
			.replace(/[^a-z0-9]+/g, separator)
			.replace(new RegExp(`^\\${separator}+|\\${separator}+$`, "g"), "")
			.slice(0, max - 3) || (separator === "-" ? "type" : "field");
	const used = new Set(taken);
	let key = base;
	for (let n = 2; used.has(key); n += 1) key = `${base}${separator}${n}`;
	return key;
}

/** The stored form of a type: everything but the built-in flag, which is decided at read time. */
export const storedType = ({ builtin: _builtin, ...rest }: ListingType) => rest;

/** The settings record with one type replaced (built-in or custom) or added. */
export function withType(stored: unknown, type: ListingType): unknown[] {
	const rows = Array.isArray(stored) ? stored : [];
	const next = storedType(type);
	const at = rows.findIndex((row) => asString(asRecord(row).slug) === type.slug);
	return at < 0 ? [...rows, next] : rows.map((row, index) => (index === at ? next : row));
}

/** The settings record without a custom type. */
export const withoutType = (stored: unknown, slug: string): unknown[] => (Array.isArray(stored) ? stored : []).filter((row) => asString(asRecord(row).slug) !== slug);

/** The slot and chip map of a type, for telling whether a save changed what the index keeps. */
export const slotMap = (type: ListingType) => JSON.stringify(type.fields.filter((field) => field.slot || field.chip).map((field) => [field.key, field.slot, field.chip]));

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
