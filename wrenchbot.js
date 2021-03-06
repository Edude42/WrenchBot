/*            _______
             ╱       ╲
            ╱   ╱────┘
           ╱   ╱
        __╱   ╱────┐
       ╱         ╲─┘
      ╱         ◦╱
     ╱         ╱╱  ┌──┐  ┌──┐┌───────╮
     \_____   ╱╱   │  ├──┤  ││  ┌─╮  │
     ╱____╱  ╱╱    │  │  │  ││  ├─┤  │
    ╱  ╱╲   ╱╱     │        ││  └─╯  │
    ╲_╱ ╱  ╱╱      └────────┘└───────╯
      _╱__╱╱
     ╱   ╱ ╱            WrenchBot
    ╱   ╱ ╱   Utility bot with fun additions
   ╱   ╱ ╱
  ╱   ╱ ╱            Version 2.X-indev
 ╱   ╱ ╱           https://encode42.dev
╱  O  ╱
\____╱
*/

// Define and require modules
const { CommandoClient } = require("discord.js-commando");
const options            = require("./config");
const moment             = require("moment");
const path               = require("path");
const fs                 = require("fs");

// Run the backend utilities
require("./data/js/backend");

// Register + create command instance
const client = new CommandoClient({
	"owner":                     options.owners,
	"invite":                    options.support,
	"commandPrefix":             options.prefix.commands,
	"commandEditableDuration":   1,
	"partials":                  ["MESSAGE", "CHANNEL", "REACTION", "USER", "GUILD_MEMBER"],
	"disableMentions":           "everyone",
	"messageCacheMaxSize":       options.performance.cache.message.maxSize,
	"messageCacheLifetime":      options.performance.cache.message.lifetime,
	"messageSweepInterval":      86400,
	"messageEditHistoryMaxSize": 2
});
client.registry
	.registerDefaultTypes()
	.registerDefaultGroups()
	.registerGroups([
		["search",     "Search"],
		["image",      "Image"],
		["fun",        "Fun"],
		["moderation", "Moderation"],
		["misc",       "Misc"]
	])
	.registerCommandsIn(path.join(__dirname, "commands"))
	.registerDefaultCommands({ "unknownCommand": false });

// Create the extended events
require("./data/js/events").run(client);

// Logger
const { log, logger } = require("./data/js/logger");
client.log = log;

// Listen and update to backend client files
listen(["./data/js/util.js"]);
function listen(files) {
	files.forEach(f => {
		require(f).run(client);
		fs.watchFile(f, () => {
			log.info(`${f} was changed! Updating...`);
			delete require.cache[require.resolve(f)];

			try {require(f).run(client)}
			catch (e) {log.error(`There was an error updating the file! ${e}`)}
		});
	});
}

const totals = require("./data/js/config").totals;
client.on("ready", async () => {
	log.ok("-----------------------------------------");
	log.ok(` WrenchBot started! ${moment().format("MM/DD/YY hh:mm:ss A")}`);
	log.ok("-----------------------------------------");
	log.info(`Name: ${client.user.tag} | ID: ${client.user.id}`);
	log.info(`${await totals.get("commands")} commands used | ${await totals.get("messages")} messages read | ${client.guilds.cache.size} servers`);

	// Start the logger
	logger(client/* , totals */);

	// Set the bots status
	if (options.status.enabled) {status(); setInterval(status, options.status.timeout * 1000)};

	async function status() {
		let status = await getStatus();

		// Re-roll if repeat
		if (client.user.presence.activities[0])
			while (status.name === client.user.presence.activities[0].name) status = await getStatus();

		// Set the status
		client.user.setActivity(status.name, { "type": status.activity, "url": status.url });
	}

	// Get a random status
	async function getStatus() {
		const status = options.status.types[Math.floor(Math.random() * options.status.types.length)];
		status.name = await client.placeholders(status.name);
		return status;
	}
});

// Finally, log it in
client.login(require("./auth").token);