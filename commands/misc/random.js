// Define and require modules
const { Command }      = require("discord.js-commando");
const { stripIndents } = require("common-tags");
const options          = require("../../config");
const random           = require("random");

module.exports = class RandomCommand extends Command {
	constructor(client) {
		super(client, {
			"name":        "random",
			"memberName":  "random",
			"group":       "misc",
			"description": "Choose a random number.",
			"details": stripIndents`
				Run \`${options.prefix.commands}random <min> <max>\` to choose a random number.
				**Notes:**
				<min>: Required, minimum number.
				<max>: Required, maximum number.
			`,
			"aliases":           ["rng"],
			"clientPermissions": ["SEND_MESSAGES", "EMBED_LINKS"],
			"args": [
				{
					"key":    "min",
					"prompt": "What is the minimum number?",
					"type":   "integer"
				},
				{
					"key":    "max",
					"prompt": "What is the maximum number?",
					"type":   "integer"
				}
			],
			"throttling": {
				"usages":   2,
				"duration": 5
			}
		});
	}

	run(message, { min, max }) {
		// Make sure min is less than max
		if (min > max) [min, max] = [max, min];

		// Send the number
		return message.channel.send(this.client.embed({ "message": message, "title": `Random Number ${min} - ${max}:`, "description": random.int(min, max) }));
	}
};