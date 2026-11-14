/** Every phrase a visitor can see on Listora. Edit this file to reword or translate the kit. */

export const S = {
	common: {
		signIn: "Sign in",
		signInContinue: "Sign in to continue.",
		required: "(required)",
		fallback: "Something went wrong. Try again.",
		offline: "Could not reach the site. Check your connection and try again.",
		previous: "Previous",
		next: "Next",
		close: "Close",
		open: "Open",
		closed: "Closed",
		featured: "Featured",
		companyWebsite: "Company website",
		yes: "Yes",
		no: "No",
		choose: "Choose one",
	},
	// The short line under each built-in type on the add-a-listing form, by type. Type names come from
	// the plugin (the owner can rename them in the admin), so they are not here.
	typeHints: {
		business: "Shops and local services",
		restaurant: "Food and drink",
		"real-estate": "Homes and rentals",
		hotel: "Rooms and stays",
		event: "Dates and venues",
		job: "Open roles",
		healthcare: "Clinics and care",
		education: "Schools and classes",
		place: "Parks and landmarks",
		classified: "Goods for sale",
		software: "Plugins, apps and tools",
	},
	days: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
	// The short help under a built-in type's field on the add-a-listing form, by field. Labels come from
	// the plugin (the owner can rename them in the admin), so they are not here.
	fieldHelp: {
		cuisine: "Italian, Korean, and so on.",
		price_range: "From $ to $$$$.",
		star_rating: "1 to 5.",
		beds: "Whole number.",
		baths: "Whole number.",
		price: "Asking or nightly rate.",
		event_start: "Date and time, in this site's time zone.",
		event_end: "Date and time, in this site's time zone.",
		salary: "Range is fine.",
		job_type: "Full-time, contract, or intern.",
		specialty: "What the practice treats.",
		program: "Course or school name.",
		asking_price: "What you want for the item.",
		place_kind: "Park, museum, or trail.",
		year_founded: "Four digits if you know it.",
		install_command: "Shown as text to copy. It is never run.",
		repository: "Full address, starting with https.",
		homepage: "Full address, starting with https.",
	},
	directory: {
		title: "Listings",
		description: "Browse the directory. Search by type, place, or name.",
		heading: "Listings",
		add: "Add a listing",
		searchLabel: "Search",
		searchPlaceholder: "Search listings",
		clearSearch: "Clear search",
		locationLabel: "Location",
		locationPlaceholder: "City or neighborhood",
		search: "Search",
		all: "All",
		browse: "Browse the directory",
		category: "Category",
		city: "City",
		featuredLabel: "Featured listings",
		sort: "Sort",
		rating: "Rating",
		titleSort: "Title",
		grid: "Grid",
		list: "List",
		calendar: "Calendar",
		emptyTitle: "No listings match",
		emptyBody: "Try another type or city. You can also add a listing.",
		noneYetTitle: "No listings yet",
		noneYetBody: "This directory is empty. Be the first to add a listing.",
		pages: "Pages of listings",
		matching: "Matching listings",
		unavailableTitle: "The directory cannot be shown right now",
		searchDownTitle: "Search is not available right now",
		searchDownBody: "Check your connection and try again.",
		mapCredit: "OpenStreetMap",
		listedBy: "Listed by",
	},
	block: {
		label: "Listings",
	},
	calendar: {
		title: "Listing calendar",
		description: "Upcoming events in the directory.",
		heading: "Calendar",
		directory: "Directory",
		emptyTitle: "No upcoming events",
		emptyBody: "Event listings with a start date appear here.",
		add: "Add an event",
	},
	transfer: {
		title: "Import and export listings",
		description: "Move listings in and out of the directory as a spreadsheet.",
		heading: "Import and export",
		intro: "Move listings in and out of the directory as a spreadsheet (CSV file).",
		exportTitle: "Export",
		exportBody: "Download every published listing as one spreadsheet, with the main details of each. Open it in Excel, Numbers or Google Sheets.",
		download: "Download listings",
		preparing: "Preparing...",
		none: "There are no published listings to download yet.",
		started: "Your download has started.",
		downloadFailed: "The download could not be prepared. Try again.",
		importTitle: "Import",
		importLead: "Add up to 100 listings at a time from a spreadsheet saved as CSV. Nothing goes live: each row becomes a draft waiting for your approval.",
		sample: "Download a sample file",
		fileLabel: "Spreadsheet (CSV)",
		check: "Check file",
		checking: "Checking...",
		tooBig: "That file is too large. Split it into files of up to 100 listings.",
		importing: "Importing...",
		continueImport: "Continue",
		waitingSite: "The site is slow to answer. Trying again in a few seconds...",
		adminsTitle: "For site admins",
		adminsBody: "Only a site admin can import or export listings.",
		queue: "Review them in the queue",
		nothingLive: "Nothing is live until you approve it.",
	},
	sample: {
		title: "Load the sample directory",
		description: "Fill a new directory with sample listings, reviews and a claim.",
		heading: "Sample directory",
		intro: "Adds 12 NYC listings with reviews, saved listings and a claim waiting for you, plus two listings waiting for your approval. Keep this page open while it loads. Loading again adds only what is missing.",
		load: "Load sample directory",
		again: "Load again",
		resume: "Continue loading",
		checking: "Checking...",
		related: "Adding reviews and ratings...",
		partly: "Loading stopped part way. Press Continue loading to finish: listings already added are skipped.",
		done: "The sample directory is loaded.",
		view: "Open the directory",
		queue: "Open the Listings queue",
		stopped: "The site took too long to answer, so loading stopped. Press Continue loading to carry on: nothing is added twice.",
		adminsBody: "Only a site admin can load the sample directory.",
	},
	submit: {
		title: "Add a listing",
		description: "Submit a directory listing in five steps. New listings stay in review until they are published.",
		heading: "Add a listing",
		intro: "Type, basics, details, categories, then a card preview.",
		backAll: "All listings",
		signInTitle: "Sign in to add a listing",
		signInBody: "An account lets you edit, renew and track your listing later.",
		stepType: "Type",
		stepBasics: "Basics",
		stepDetails: "Details",
		stepCategories: "Categories",
		stepPreview: "Preview",
		what: "What are you listing?",
		typeHelp: "Pick one type. Extra fields change on the Details step.",
		basicsHelp: "Name and place first. Contact comes next.",
		titleLabel: "Listing title",
		titleHelp: "Use the public business name.",
		titleError: "Enter a title.",
		summary: "Short summary",
		summaryHelp: "Shown on cards. 280 characters or fewer.",
		descriptionLabel: "Description",
		descriptionHelp: "What a visitor should know before they arrive.",
		city: "City",
		address: "Street address",
		detailsHelp: "Phone, web, and fields for this listing type.",
		phone: "Phone",
		email: "Email",
		website: "Website",
		websiteHelp: "Full URL, including https.",
		listedBy: "Listed by",
		amenities: "Amenities",
		amenitiesHelp: "Comma-separated, such as wifi, parking, outdoor.",
		categoriesHelp: "Help people filter this listing.",
		category: "Category",
		noCategory: "No category",
		country: "Country",
		state: "State",
		previewHelp: "This is how the listing card will read.",
		agree: "I confirm this listing is accurate.",
		agreeError: "Confirm the listing is accurate before you submit.",
		back: "Back",
		continue: "Continue",
		send: "Submit for review",
		untitled: "Untitled",
		cityMissing: "City not set",
		noSummary: "No summary yet.",
		editTitle: "Edit your listing",
		editBack: "Back to my listings",
		editPending: "You already sent changes that are waiting for approval. Sending again replaces them.",
		editQuiet: "Your listing stays as it is until your changes are approved.",
		editUnavailable: "That listing is not available to edit.",
		editSend: "Send changes for approval",
		unchanged: "Nothing was different, so there is nothing to approve.",
		changesWaiting: "Thanks. Your changes are waiting for approval. Your listing stays as it is until then.",
		backListings: "Back to your listings",
		yourListings: "View your listings",
		addAnother: "Add another listing",
		thanksReview: "Thanks. Your listing is in review and will appear after it is published.",
		thanksLive: "Thanks. Your listing was submitted.",
		couldNot: "Could not submit.",
		duplicateBefore: "A listing named ",
		duplicateAfter: " already exists.",
	},
	listing: {
		breadcrumb: "Breadcrumb",
		expiredNotice: "This listing has expired. Hours and contact may be out of date.",
		photos: "Photos",
		expired: "Expired",
		save: "Save",
		saved: "Saved",
		share: "Share",
		copied: "Copied",
		directions: "Directions",
		getDirections: "Get directions",
		claim: "Claim",
		sections: "Listing sections",
		details: "Details",
		reviews: "Reviews",
		contact: "Contact",
		noDescriptionTitle: "No description yet",
		noDescriptionBody: "The owner has not added a longer write-up.",
		services: "Services",
		writeReview: "Write a review",
		writeHelp: "Stars and a short note. The owner can reply later.",
		stars: "Stars",
		starsHelp: "5 is excellent.",
		reviewTitle: "Title",
		reviewTitleHelp: "A short headline for the review.",
		review: "Review",
		reviewHelp: "Say what a visitor should know.",
		reviewError: "Write a review before you submit.",
		submitReview: "Submit review",
		contactTitle: "Contact this listing",
		contactHelp: "Do not send payment details.",
		name: "Name",
		email: "Email",
		message: "Message",
		messageHelp: "The owner sees this message.",
		messageError: "Write a message before you send.",
		send: "Send message",
		listedBy: "Listed by",
		hours: "Hours",
		openNow: "Open now",
		closedNow: "Closed now",
		today: "today",
		location: "Location",
		claimed: "Claimed listing",
		claimTitle: "Is this your business?",
		claimHelp: "A claim goes to review. The decision shows in your account, under Claims.",
		nameError: "Enter your name.",
		emailError: "Enter a valid email.",
		proof: "Proof",
		proofHelp: "Say how you can show you own this listing.",
		proofError: "Add proof before you claim.",
		claimSend: "Claim listing",
		reviewsDown: "Reviews could not be loaded",
		tryAgain: "Try again in a moment.",
		noReviews: "No reviews yet",
		firstReview: "Be the first to review this listing.",
		moreReviews: "More reviews",
		member: "Member",
		ownerReply: "Reply from the owner",
		reviewThanks: "Thanks. Your review will appear once it is approved.",
		messageSent: "Message sent.",
		couldNotSend: "Could not send.",
		claimSent: "Claim sent for review.",
		youManage: "You manage this listing",
		youManageBody: "Change it, add photos, reply to reviews and read messages from your account.",
		openAccount: "Open my listings",
		signInReview: "Sign in to write a review",
		signInReviewBody: "Reviews come from members of this site, so each one has a name behind it.",
		signInClaim: "Sign in to claim this listing",
		claimedByOwner: "This listing is managed by its owner.",
	},
	// The Software look: its card in the directory and the sections of its listing page.
	software: {
		viewOnGithub: "View on GitHub",
		repository: "Repository",
		docs: "Docs",
		report: "Report",
		reportMessage: "Something is wrong with this listing: ",
		install: "Install",
		installHelp: "Copy this line and run it yourself. Check what it does first.",
		copy: "Copy",
		copied: "Copied",
		copyFailed: "Select the line and copy it.",
		about: "About",
		screenshots: "Screenshots",
		maintainedBy: "Maintained by",
		claimTitle: "Do you maintain this?",
		stars: "stars or installs",
		version: "Version",
		lastRelease: "Last release",
		openSource: "Open source",
		badges: "About this software",
		poll: "Poll",
	},
	account: {
		title: "Your listings",
		description: "Owner dashboard for listings, reviews, claims, and favorites.",
		heading: "Dashboard",
		guestIntro: "Your listings, reviews, claims and saved places.",
		add: "Add a listing",
		signInTitle: "Sign in to see your dashboard",
		signInBody: "Your listings, reviews, claims and saved places live here.",
		nav: "Dashboard",
		overview: "Overview",
		myListings: "My listings",
		reviews: "Reviews",
		messages: "Messages",
		claims: "Claims",
		favorites: "Favorites",
		profile: "Profile",
		overviewHelp: "What you have in the directory. Choose one to open it.",
		reviewsOf: "Reviews of your listings",
		reviewsHelp: "Reply once to each review. Your reply shows under it after it is approved.",
		reviewsWrote: "Reviews you wrote",
		messagesHelp: "Sent by visitors from your listing pages. Reply to them by email.",
		profileTitle: "Profile and privacy",
		downloadHelp: "Download a file with your reviews, claims and saved listings.",
		download: "Download my data",
		deleteTitle: "Delete my data",
		deleteRemoves: "This removes, for good: your reviews, your claims, your saved listings, your replies to reviews, any changes or photos still waiting for approval, and your stored email address.",
		deleteKeeps: "It keeps: listings you added, which stay in the directory, and photos already approved on a listing. Ask the site to remove those.",
		delete: "Delete my data",
		deleteAgain: "Click again to delete them for good",
		deleted: "Your reviews, claims and saved listings were deleted.",
		couldNotDelete: "Could not delete. Try again.",
		listings: "Listings",
		gone: "Listing no longer available",
		expired: "Expired",
		renew: "Renew",
		changesWaiting: "Changes waiting for approval",
		editAgain: "Edit again",
		edit: "Edit",
		emptyTitle: "Nothing here yet",
		emptyBody: "This tab fills as you use the directory.",
		onListing: "On your listing",
		waiting: "Waiting for approval",
		remove: "Remove",
		addPhoto: "Add a photo",
		adding: "Adding your photo...",
		photoFailed: "The photo could not be added. Try again.",
		photoAdded: "Photo added. It shows on your listing after it is approved.",
		photoRemoveFailed: "Could not remove that photo.",
		wrongType: "Use a JPEG, PNG or WebP photo.",
		tooBig: "That photo is larger than 5 MB.",
		replyFailed: "Could not send your reply.",
		messageFailed: "Could not update that message.",
		renewFailed: "Could not renew.",
		loadFailed: "Could not load your dashboard.",
		yourReply: "Your reply",
		changeReply: "Change your reply",
		reply: "Reply",
		aMember: "A member",
		replyLabel: "Your reply (public, up to 1000 characters)",
		sendReply: "Send for approval",
		partial: "Showing the newest 100 of each list.",
		moreReceived: "More reviews",
		moreMessages: "More messages",
		deleting: "Deleting your data...",
		allOnListing: "All of them are on the listing, under Reviews.",
		noReviewsTitle: "No reviews yet",
		noReviewsBody: "Reviews of your listings show here once they are published.",
		noName: "No name given",
		fresh: "New",
		markNew: "Mark as new",
		markDone: "Mark as done",
		from: "From",
		aListing: "Listing",
		noMessagesTitle: "No messages yet",
		noMessagesBody: "Messages from your listing pages show here.",
		exportFailed: "Could not prepare your data. Try again.",
		exported: "Your file was downloaded.",
		pending: "Awaiting approval",
		approved: "Approved",
		published: "Published",
		rejected: "Not approved",
	},
};

export function listingCount(n: number): string {
	return n === 1 ? "1 listing" : `${n} listings`;
}

export function resultCount(n: number): string {
	return n === 1 ? "1 result" : `${n} results`;
}

export function eventCount(n: number): string {
	return n === 1 ? "1 upcoming event" : `${n} upcoming events`;
}

export function pageOf(page: number, pages: number): string {
	return `Page ${page} of ${pages}`;
}

export function pageNumber(page: number): string {
	return `Page ${page}`;
}

export function starsOf(count: string): string {
	return `${count} stars or installs`;
}

export function copyNamed(title: string): string {
	return `Copy the install command for ${title}`;
}

export function saveNamed(title: string): string {
	return `Save ${title}`;
}

export function rated(average: string, count: number): string {
	return `Rated ${average} out of 5 from ${count} reviews`;
}

export function reviewSummary(average: string, count: number): string {
	return `${average} (${count} ${count === 1 ? "review" : "reviews"})`;
}

export function outOf5(n: number): string {
	return `${n} out of 5`;
}

export function openPhoto(index: number, total: number): string {
	return `Open photo ${index} of ${total}`;
}

export function photosOf(title: string): string {
	return `Photos of ${title}`;
}

export function photoAlt(title: string, index: number, total: number): string {
	return `${title}, photo ${index} of ${total}`;
}

export function photoPosition(index: number, total: number): string {
	return `Photo ${index} of ${total}`;
}

/** Under Reviews of your listings, when a listing has more reviews than the dashboard shows. */
export function newestReviewsOf(shown: number, total: number): string {
	return `Showing the newest ${shown} of ${total} reviews of`;
}

export function signedInAs(name: string): string {
	return `Signed in as ${name}.`;
}

export function duplicateNamed(title: string): string {
	return `${S.submit.duplicateBefore}${title}${S.submit.duplicateAfter}`;
}

export function rowsCannot(n: number): string {
	return `${n} ${n === 1 ? "row" : "rows"} cannot be imported`;
}

export function rowsSkipped(n: number): string {
	return `${n} already in the directory, skipped`;
}

export function rowsReady(valid: number, total: number): string {
	return `${valid} of ${total} ${total === 1 ? "row is" : "rows are"} ready to import.`;
}

export function importDrafts(n: number): string {
	return `Import ${n} ${n === 1 ? "listing" : "listings"} as drafts`;
}

export function importedDrafts(n: number): string {
	return `${n} ${n === 1 ? "listing" : "listings"} added as drafts.`;
}

export function rowLine(line: number, title: string, reason: string): string {
	return title ? `Row ${line} (${title}): ${reason}` : `Row ${line}: ${reason}`;
}

export function rowDup(line: number, title: string, city: string): string {
	return city ? `Row ${line}: ${title}, ${city}` : `Row ${line}: ${title}`;
}

export function expiresOn(when: string): string {
	return `Expires ${when}`;
}

export function photoName(index: number): string {
	return `Photo ${index}`;
}

export function photoUsage(count: number, limit: number): string {
	return `Photos: ${count} of ${limit}. JPEG, PNG or WebP, up to 5 MB each. Each one shows after it is approved.`;
}

export function freshCount(n: number): string {
	return `${n} new`;
}

export function renewedUntil(when: string): string {
	return `Renewed until ${when}.`;
}

export function minutes(n: number): string {
	return `${n} min`;
}

const CODES: Record<string, string> = {
	SIGN_IN_REQUIRED: S.common.signInContinue,
	RATE_LIMITED: "Too many requests. Try again in an hour.",
	NOT_FOUND: "That listing is not available.",
	BLOCKED: "This member cannot review.",
	OWN_LISTING: "You cannot review your own listing.",
	SPAM: "Submission rejected.",
	FORBIDDEN: "Only the listing owner can renew it.",
	INVALID_EMAIL: "Enter a full email address, or leave it blank.",
	NOT_RENEWABLE: "This listing does not need renewing.",
	BUSY: "This listing is being edited. Try again later.",
	CONTENT_UNAVAILABLE: "The listings collection is not set up on this site.",
	WRONG_TYPE: S.account.wrongType,
	TOO_BIG: S.account.tooBig,
	OFFLINE: S.common.offline,
	FAILED: S.common.fallback,
	// EmDash 1.5 refuses writes with this while a plugin update builds its storage indexes.
	STORAGE_INDEXES_NOT_READY: "The directory is finishing an update. Try again in a moment.",
};

/** Plain sentence for a server error code. A missing code uses the general fallback. */
export function phrase(code?: string): string {
	return CODES[code || ""] || S.common.fallback;
}

export function importProgress(done: number, total: number): string {
	return `Importing ${done} of ${total}...`;
}

/** The import stopped because the site did not answer in time. Nothing is lost and nothing doubles. */
export function importStopped(imported: number, line: number): string {
	return `The site took too long to answer, so the import stopped at row ${line} of your file. ${imported} ${imported === 1 ? "listing was" : "listings were"} added as drafts so far. Press Continue to carry on from row ${line}: rows already added are skipped, never added twice.`;
}

export function sampleProgress(done: number, total: number): string {
	return `Loading listings: ${done} of ${total}...`;
}

export function exportProgress(rows: number): string {
	return rows === 1 ? "Preparing... 1 listing so far" : `Preparing... ${rows} listings so far`;
}
