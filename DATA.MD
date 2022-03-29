# On the data usage of this bot

Note: The information here pertains to the default configuration of the bot, which is also the one being used for the instance that we run. 
Other people operating a bot based on this source code might have changed these settings, or how the bot handles data entirely. Please consult with them directly if you are using a bot hosted by another party. 

## What the bot stores 

### How users are identified
This bot (and all automated Discord tooling for that matter) identifies you as the user by your "Snowflake". This is a platform-wide unique identifier, and it exists not just for Discord users, but also for channels, servers, you name it. We use this to identify you when you are playing with the bot, and we use it to store your latest user settings (see below). 

### During the game 
During the game, the bot has to remember the aforementioned ids for all players in the lobby. In "free" mode, this will generally only be the host.
We also store the id of the channel the game is hosted in. All of this data is not used after the game has ended and eventually deleted lazily. The bot operators do not have access to this information and are not able to determine in which channels and or servers you are using the bot. If stats tracking is enabled, the operators can configure the bot to send them a summary of the games played within a certain interval, which includes the game configuration used as well as the results. Crucially, this information does not feature any user, channel or server ids and is therefore perfectly anonymous. In addition, this can be turned of in the lobby, if you so desire.

### Beyond individual games
Every user that has ever created a session while have their last game configuration (list used, word length, number of guesses, etc.) remembered for (default configuration) 3 months. The bot does currently not store seperate configurations for each channel or server that an individual user has used the server in, and instead has exactly one configuration per user. We also store a timestamp with your configuration file, to determine when was the last time you interacted with the bot. The bot needs this to automatically delete your data after the passing of the standard interval, 3 months. Importantly, if you "inherit" a session, i.e. you have joined a session and the original owner left, causing the bot to promote you to the owner, the configuration of that session is not stored and if you have not yet created a session on your own, no information will be stored and associated with your id. 
It should be noted that administrators can see this information (it is persisted in a file regularly and during shutdown) and might therefore, given your Discord Snowflake, look up your latest configuration and the date of your last interaction with the bot (within 3 months). If prompted, they can also remove your data before the passing of the 3 month interval manually. 

## What the bot does not store

Simply put, everything else. In particular, the bot *never* stores any messages it sees via its permissions for longer than it takes to determine if they are a guess to an ongoing game or a command. The operators of the bot *never* see the contents of your messages in the bot's presence.
