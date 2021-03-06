// Define and require modules
const { forEach, some } = require("p-iteration");
const sort  = require("sort-json");
const path  = require("jsonpath");
const _     = require("lodash");
const fs    = require("fs");

// Define and require modules
const SQLite = require("@josh-providers/sqlite");
const Josh   = require("josh");

// Location where the database is saved
const location = { "dataDir": "./data/private/database" };

// Per-server settings
const guildConfig = new Josh({
	"name":            "guildConfig",
	"serializer":      (a) => {
		const parsed = stringJSON(a);
		return a instanceof Object ? a
			: typeof parsed === "number" ? accurateInt(a) ? parsed
			: a : parsed;
	},
	"provider":        SQLite,
	"providerOptions": location
});

// Per-server reactions
const reactionConfig = new Josh({
	"name":           "reactionConfig",
	"provider":        SQLite,
	"providerOptions": location
});

// Tags
const tagConfig = new Josh({
	"name":            "tagConfig",
	"provider":        SQLite,
	"providerOptions": location
});

// Command counter
const totals = new Josh({
	"name":           "totals",
	"provider":        SQLite,
	"providerOptions": location
});
totals.ensure("commands", 0);
totals.ensure("messages", 0);
totals.ensure("automod",  0);

// Defaults + migrations + options
const defaultConfig           = require("../json/defaultConfig");
const defaultConfigMigrate    = require("../json/defaultConfig.migrate");
const defaultConfigValidate   = require("../json/defaultConfig.validate");
const defaultReactions        = require("../json/defaultReactions");
const defaultTags             = require("../json/defaultTags");

class TinyConfig {
	constructor(config, id, message, options) {
		this.message = message || {};
		this.channel = this.message.channel;
		options      = (this.message.id ? options : this.message) || {};

		this.guild  = id.id ? id : undefined;
		this.client = this.rawGuild ? this.rawGuild.client : undefined;
		this.id     = id.id ? id.id : id;

		switch (config) {
			case "custom":
				this.migrations = options.migrate;
				this.validate   = options.validate;
				this.config     = options.config;
				this.file       = options.file;
				break;

			case "guild":
				this.migrations = defaultConfigMigrate;
				this.validate   = defaultConfigValidate;
				this.config     = guildConfig;
				this.file       = defaultConfig;
				break;

			case "reactions":
				this.config = reactionConfig;
				this.file   = defaultReactions;
				break;

			case "tags":
				this.config = tagConfig;
				this.file   = defaultTags;
				break;
		}
	}

	// Make sure the ID exists in the config
	async ensure() {await this.config.ensure(this.id, { "version": this.file.version })}

	// Check if a server config needs any migrations
	async check(command) {
		const config = await this.config.get(this.id);
		if (config.version === this.file.version) return config;

		// Migrate to each config version
		return await new Promise(resolve => {
			this.migrations.run.forEach(async m => {
				if ((await this.config.get(this.id)).version === m.info.from) {
					// Check if the migration has breaking changes
					if (m.info.breaking && !command) {
						resolve(false);
						return;
					}

					// Migrate the config
					const migrated = await this.migrate(m);
					await this.config.delete(this.id);
					await this.config.set(this.id, migrated);
					resolve(config);
				}
			});
		});
	}

	// Migrate a config file
	async migrate(migration) {
		const workingJSON = _.cloneDeep(await this.config.get(this.id));

		// General steps (parsing, invalidation, etc.)
		migration.steps.forEach(s => {
			path.apply(workingJSON, `$.${s[0]}`, v => {
				return s[1] === "invalidate" || v === undefined ? null
					: s[1] === "parse" ? JSON.parse(v)
					: JSON.parse(s[1]);
			});
		});

		// Move element locations
		migration.move.forEach(m => {
			const toBe = _.get(workingJSON, m[0]);
			_.unset(workingJSON, m[0]);
			_.set(workingJSON, m[1], toBe);
		});

		// Remove entire elements
		migration.remove.forEach(r => {
			_.unset(workingJSON, r);
		});

		workingJSON.version++;
		return sort(removeNull(workingJSON), { "depth": 1 });
	}

	// Get the merged config
	async get() {
		await this.ensure();
		const config = await this.check();

		// Return config if non-breaking
		return !config ? false : _.merge(_.cloneDeep(this.file), config);
	}

	// Get the raw, unformatted config
	async getRaw() {
		await this.ensure();
		return this.config.get(this.id);
	}

	// Get details about the local/current config
	async getDetails() {
		await this.ensure();
		return {
			"version": {
				"local":   (await this.config.get(this.id)).version,
				"current": this.file.version
			},
			"info": this.migrations.run[0].info
		};
	}

	// Set exact config properties
	async set(property, value) {
		const checked = await this.checks(property, value);
		if (!checked.valid) return checked;

		await this.config.set(`${this.id}.${property}`, value);
		return { "valid": true };
	}

	// Add/remove from arrays
	// CURRENTLY BROKEN! JOSH ISSUE?
	async add(property, value) {
		const checked = await this.checks(property, value);
		if (!checked.valid) return checked;

		_.get(await this.config.get(`${this.id}`), property) ? await this.config.push(`${this.id}.${property}`, value)
			: await this.config.set(`${this.id}.${property}`, [value]);
		return { "valid": true };
	}

	async remove(property, value) {
		await this.config.remove(`${this.id}.${property}`, value);
		return { "valid": true };
	};

	// Delete entire values from the config
	async delete(value) {
		await this.config.delete(this.id, value);
		return { "valid": true };
	}

	// Completely clear and reset the config
	async reset() {
		await this.config.delete(this.id);
		this.ensure();
	}

	// Make sure the input type is valid
	async checks(property, value) {
		if (!this.validate) return { "valid": true };

		const option = _.get(this.validate, property).split(",");
		const input  = value.split(",");
		const valid  = [];
		const reason = [];

		if (option.length !== input.length) return { "valid": false, "reason": `The input type was not a \`${reason.join("`, `")}\`. ${option.join().includes(",") ? `(Format: \`${option}\`)` : ""}` };

		// Each required argument
		await forEach(option, async (r, i) => {
			// Each optional argument
			valid.push(await some(r.split("|"), async o => {
				reason.push(o);
				switch (o) {
					case "string":           return typeof stringJSON(input[i]) === "string";          // Strings

					case "boolean":          return input[i] === "true" ? true : input[i] === "false"; // Booleans

					case "int":              return Number.isInteger(JSON.parse(input[i]));            // Integers

					case "percent":                                                                    // Percentages
						const parsed = parseInt(o.replace("%", ""), 10);
						if (o.indexOf("%") > 0 || parsed > 100 || parsed < 0) return false;
						return true;

					case "guildChannelID":   return !!(this.guild.channels.cache.get(input[i]));       // Discord | Channel ID in server

					case "guildEmojiID":                                                               // Discord | Emoji ID in server
						return !!(/[\uD800-\uDBFF][\uDC00-\uDFFF]/.test(input[i]) ||
						this.guild.emojis.cache.get(input[i]));
					case "guildRoleID":      return !!(this.guild.roles.cache.get(input[i]));          // Discord | Role ID in server

					case "channelMessageID": return !!(await this.channel.messages.fetch(input[i]));   // Discord | Message ID in channel

					case "static":           return false;                                             // Static

					default: return input[i] === o; // Default, specific values
				}
			}));
		});

		if (valid.filter(Boolean).length === option.length) return { "valid": true };
		return { "valid": false, "reason": `The input type was not a \`${reason.join("`, `")}\`. ${option.join().includes(",") ? `(Format: \`${option}\`)` : ""}` };
	}
}

// Remove "null" or "{}" values from JSON
function removeNull(json) {
	return JSON.parse(JSON.stringify(json), (k, v) => {
		if (v === null || JSON.stringify(v) === "{}") return;
		return v;
	});
}

// Convert strings into their data type
function stringJSON(json) {
	let output  = json;
	try {output = JSON.parse(json)} catch {}

	return output;
};

function accurateInt(number) {return number < 9007199254740991 && number > -9007199254740991}

module.exports = TinyConfig;

// Migrate Enmap -> JOSH
module.exports.migrateFromEnmap = async (log) => {
	// log.info("Old Enmap database found, migrating...");

	const dataDir = "./data/private/enmap";
	const Enmap   = require("enmap");

	// Grab the old Enmap settings
	const oldGuildConfig    = new Enmap({ "name": "guildConfig",    "dataDir": dataDir });
	const oldReactionConfig = new Enmap({ "name": "reactionConfig", "dataDir": dataDir });
	const oldTagConfig      = new Enmap({ "name": "tags",           "dataDir": dataDir });
	const oldTotals         = new Enmap({ "name": "totals",         "dataDir": dataDir });

	// Import the old Enmap data to JOSH
	await guildConfig.import(await oldGuildConfig.export());
	await reactionConfig.import(await oldReactionConfig.export());
	await tagConfig.import(await oldTagConfig.export());
	await totals.import(await oldTotals.export());

	// Remove unused values
	totals.delete("translations");

	// Close and rename
	await oldGuildConfig.close(); await oldReactionConfig.close();
	await oldTagConfig.close();   await oldTotals.close();

	fs.renameSync("./data/private/enmap", "./data/private/enmap.bak");

	// log.ok("Migrated the Enmap database to JOSH!");
};

// Export individual databases
module.exports.guildConfig    = guildConfig;
module.exports.reactionConfig = reactionConfig;
module.exports.tagConfig      = tagConfig;
module.exports.totals         = totals;