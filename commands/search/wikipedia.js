// Define and require modules
const { Command }      = require("discord.js-commando");
const { stripIndents } = require("common-tags");
const wikipedia        = require("wikijs").default;
const options          = require("../../config");

module.exports = class WikipediaCommand extends Command {
	constructor(client) {
		super(client, {
			"name":        "wikipedia",
			"memberName":  "wikipedia",
			"group":       "search",
			"description": "Search Wikipedia.",
			"details": stripIndents`
				Run \`${options.prefix.commands}wikipedia <search>\` to search Wikipedia.
				**Notes:**
				<search>: Required, what will be searched.
				Arguments must be links, slugs, or titles. 
			`,
			"args": [
				{
					"key": "toSearch",
					"prompt": "What would you like to search for?",
					"type": "string"
				}
			],
			"aliases":           ["wiki"],
			"clientPermissions": ["SEND_MESSAGES", "EMBED_LINKS"],
			"throttling": {
				"usages":   2,
				"duration": 5
			}
		});
	}

	async run(message, { toSearch }) {
		// Search on Wikipedia
		wikipedia().page(toSearch).then(async result => {
			const embedMessage = {
				"message":     message,
				"attachments": ["data/img/wikipedia.png"],
				"title":       result.raw.title,
				"url":         result.url(),
				"thumbnail":   "attachment://wikipedia.png"
			};

			// Detect whether or not there are multiple results
			const summary = await result.summary();
			if (summary.includes("may refer to:")) {
				embedMessage.description = stripIndents`
					**Multiple results found:**
					${this.client.truncate((await result.links()).join(", "), 250)}
				`;
			} else {embedMessage.description = this.client.truncate(summary, 250)}

			// Send the article
			return message.channel.send(this.client.embed(embedMessage));
		}).catch(() => {message.reply(`I cannot find any article related to ${toSearch}.`)});
	}
};