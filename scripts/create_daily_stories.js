const path = require('path');
const fs = require('fs');
const axios = require('axios');
const { Configuration, OpenAIApi } = require('openai');

const configuration = new Configuration({
	apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

const NEW_STORIES_URL = 'https://hacker-news.firebaseio.com/v0/topstories.json';
const ITEM_URL = 'https://hacker-news.firebaseio.com/v0/item/';

const TODAY = new Date();
const YESTERDAY = new Date( TODAY.getTime() - (24 * 60 * 60 * 1000) );

function sleep(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchNewestStories() {
	try {
		const response = await axios.get(NEW_STORIES_URL);
		const newStoryIds = response.data.slice(0, 250);
		console.log( 'Retrieved ' + newStoryIds.length + ' stories' );
		const out = [];
		for (const storyId of newStoryIds) {
			console.log( 'Processing story ID ' + storyId );
			const storyData = await fetchStoryData(storyId);
			const storyDate = new Date(storyData.time * 1000);
			if ( storyDate.getDate() === YESTERDAY.getDate() ) {
				if ( storyData.descendants >= 3 && storyData.score >= 5 ) {
					console.log( 'Checking story "' + storyData.title +'" for AI content...' );
					try {
						const completion = await openai.createChatCompletion({
							model: 'gpt-3.5-turbo',
							messages: [
								{ role: 'system', content: 'You are a classifier deciding whether a story is about AI or not soley based on its title. You return "true" if the story is about AI and "false" if it is not. You have to choose one or the other.' },
								{ role: 'user', content: 'Story: '+storyData.title+'. Result (true|false):' },
							]
						}, {
							timeout: 10000,
						});
						const label = completion.data.choices[0].message.content.toLowerCase();
						console.log( 'About AI? ' + label );
						if ( !label.startsWith( 'true' ) ) {
							continue;	
						}
					
						// Retrieve all kids of the story and add them to the out array
						await fetchKids( storyData );
						delete storyData.kids;
						delete storyData.type;
						out.push(storyData);
					} catch (error) {
						console.error('Error generating daily digest:', error);
					}
				}
			}
			await sleep(1000);
		}
		return out;
	} catch (error) {
		console.error('Error fetching stories:', error);
	}
}

async function fetchKids( story ) {
    story.comments = [];
    for (const kidId of story.kids) {
        const kidData = await fetchStoryData(kidId);
        if ( kidData.deleted ) {
            continue;
        }
        if ( kidData.kids ) {
            await fetchKids( kidData );
        }
        delete kidData.parent;
        delete kidData.type;
        delete kidData.time;
        delete kidData.id;
        story.comments.push(kidData);
    }
    delete story.kids;
}

async function fetchStoryData(storyId) {
	try {
		const response = await axios.get(`${ITEM_URL}${storyId}.json`);
		return response.data;
	} catch (error) {
		console.error(`Error fetching story data for ID ${storyId}:`, error);
	}
}


async function main() {
	const stories = await fetchNewestStories();
	console.log( 'Found ' + stories.length + ' stories.' );
	fs.writeFileSync( path.join( __dirname, '..', 'data', 'stories.json' ), JSON.stringify( stories, null, 2 ) );
}

main();