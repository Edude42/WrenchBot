﻿const { Command } = require('discord.js-commando');
const { stripIndents } = require('common-tags');
const { verify } = require('../util');

module.exports = class TicTacToeCommand extends Command {
	constructor(client) {
		super(client, {
			name: 'tic-tac-toe',
			aliases: ['tictactoe'],
			group: 'fun',
			memberName: 'tic-tac-toe',
			description: 'Play a game of tic-tac-toe.',
			guildOnly: true,
			args: [
				{
					key: 'opponent',
					prompt: 'What user would you like to challenge?',
					type: 'user'
				}
			]
		});

		this.playing = new Set();
	}

	async run(msg, { opponent }) {
		if (opponent.bot) return msg.reply('That is a bot! You must play against a real user.');
		if (opponent.id === msg.author.id) return msg.reply('You can\'t play with yourself.');
		if (this.playing.has(msg.channel.id)) return msg.reply('Only one game may be active per channel.');
		this.playing.add(msg.channel.id);
		try {
			await msg.say(`${opponent}, would you like to play against ${msg.author}?`);
			const verification = await verify(msg.channel, opponent);
			if (!verification) {
				this.playing.delete(msg.channel.id);
				return msg.say('They have declined.');
			}
			const sides = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
			const taken = [];
			let userTurn = true;
			let winner = null;
			while (!winner && taken.length < 9) {
				const user = userTurn ? msg.author : opponent;
				const sign = userTurn ? 'X' : 'O';
				await msg.say(stripIndents`
					${user}, which side do you pick?
					\`\`\`
					${sides[1]} | ${sides[2]} | ${sides[3]}
					—————————
					${sides[4]} | ${sides[5]} | ${sides[6]}
					—————————
					${sides[7]} | ${sides[8]} | ${sides[9]}
					\`\`\`
				`);
				const filter = res => {
					const choice = res.content;
					return res.author.id === user.id && sides.includes(choice) && !taken.includes(choice);
				};
				const turn = await msg.channel.awaitMessages(filter, {
					max: 1,
					time: 30000
				});
				if (!turn.size) {
					await msg.say('Sorry, time is up!');
					userTurn = !userTurn;
					continue;
				}
				const choice = turn.first().content;
				sides[Number.parseInt(choice, 10)] = sign;
				taken.push(choice);
				if (this.verifyWin(sides)) winner = userTurn ? msg.author : opponent;
				userTurn = !userTurn;
			}
			this.playing.delete(msg.channel.id);
			return msg.say(winner ? `Congrats, ${winner}!` : 'It\'s a tie.');
		} catch (err) {
			this.playing.delete(msg.channel.id);
			throw err;
		}
	}

	verifyWin(sides) {
		return (sides[1] === sides[2] && sides[1] === sides[3])
			|| (sides[1] === sides[4] && sides[1] === sides[7])
			|| (sides[4] === sides[5] && sides[4] === sides[6])
			|| (sides[2] === sides[5] && sides[2] === sides[8])
			|| (sides[7] === sides[8] && sides[7] === sides[9])
			|| (sides[3] === sides[6] && sides[3] === sides[9])
			|| (sides[1] === sides[5] && sides[1] === sides[9])
			|| (sides[3] === sides[5] && sides[3] === sides[7]);
	}
};