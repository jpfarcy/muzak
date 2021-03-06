"use strict";

const SqueezeServer = require("squeezenode-lordpengwin");
const config = require("../config");
const Utils = require("../utils");
const Persist = require("../persist/persist");

const Intent = require("./intent");
const ChangeVolume = require("./changevolume");
const Help = require("./help");
const Name = require("./name");
const NextTrack = require("./nexttrack");
const Pause = require("./pause");
const PlayPlaylist = require("./play-playlist");
const PreviousTrack = require("./previoustrack");
const Randomize = require("./randomize");
const Repeat = require("./repeat");
const Resume = require("./resume");
const Select = require("./select");
const SetVolume = require("./setvolume");
const Start = require("./start");
const StartShuffle = require("./startshuffle");
const Stop = require("./stop");
const StopShuffle = require("./stopshuffle");
const Sync = require("./sync");
const Unsync = require("./unsync");
const WhatsPlaying = require("./whatsplaying");

/**
 * Class to map intents to the target handler.
 */

class IntentMap {

    /**
     * Called when the user specifies an intent for this skill.
     *
     * @param intentRequest The full request
     * @param session The current session
     * @param callback A callback used to return results
     */

    static onIntent(intentRequest, session, callback) {

        console.log("IntentMap.onIntent requestId=" + intentRequest.requestId + ", sessionId=" + session.sessionId);

        // Check for a Close intent

        switch (intentRequest.intent.intentName) {
            case "Close":
                closeInteractiveSession(callback);
                return;

            case "AMAZON.HelpIntent":
                Help(session, callback);
                return;

            default:
                break;
        }

        // Connect to the squeeze server and wait for it to finish its registration

        var squeezeserver = new SqueezeServer(config.squeezeserverURL, config.squeezeserverPort, config.squeezeServerUsername, config.squeezeServerPassword);
        squeezeserver.on("register", function () {


            // Get the list of players as any request will require them

            squeezeserver.getPlayers(function (reply) {

                if (reply.ok) {

                    // We will get the persisted player name before dispatching the intent as all these intents required the player name

                    Persist.retrieve()
                           .then(result => IntentMap.dispatchIntent(squeezeserver, reply.result, intentRequest.intent, session, result.Items[0].Value.S, callback)).catch(err => IntentMap.dispatchIntent(squeezeserver, reply.result, intentRequest.intent, session, "", callback));
                } else {
                    callback(session.attributes, Utils.buildSpeechResponse("Get Players", "Failed to get list of players", null, true));
                }
            });
        });
    }

    /**
     * Identify the intent and dispatch it to the target static
     *
     * @param squeezeserver The handler to the SqueezeServer
     * @param players A list of players on the server
     * @param intent The target intent
     * @param session The current session
     * @param lastname The name of the player used in the last request
     * @param callback The callback to use to return the result
     */

    static dispatchIntent(squeezeserver, players, intent, session, lastname, callback) {

        console.log("Got intent: %j", intent);
        //console.log("Session is %j", session);

        switch (intent.name) {

            case "SyncPlayers":
                Sync(squeezeserver, players, intent, session, lastname, callback);
                break;

            case "NamePlayers":
                namePlayers(players, session, callback);
                break;

            default:
                this.dispatchSecondaryIntent(squeezeserver, players, intent, session, lastname, callback);
                break;
        }
    }

    /**
     * This dispatches intents that target a specific player
     *
     * @param squeezeserver The handle to the SqueezeServer
     * @param players A list of the players
     * @param intent The current intent
     * @param session The current session
     * @param lastname
     * @param callback The callback to use to return the result
     */

    static dispatchSecondaryIntent(squeezeserver, players, intent, session, lastname, callback) {

        var intentName = intent.name;

        // Get the name of the player to look-up from the intent slot if present

        var name = ((typeof intent.slots !== "undefined") &&
                    (typeof intent.slots.Player !== "undefined") &&
                    (typeof intent.slots.Player.value !== "undefined") &&
                    (intent.slots.Player.value !== null) ? intent.slots.Player.value : (typeof session.attributes !== "undefined" ? session.attributes.player : ""));

        // Try to find the target player

        var player = Intent.findPlayerObject(squeezeserver, players, name, lastname);
        if (player === null || player === undefined) {

            // Couldn't find the player, return an error response

            console.log("Player not found: " + name);
            callback(session.attributes, Utils.buildSpeechResponse(intentName, "Player not found", null, session.new));

        } else {

            console.log("Player is " + player);
            session.attributes = {
                player: player.name.toLowerCase()
            };

            // Call the target intent

            switch (intentName) {

                case "AMAZON.PauseIntent":
                    Pause(player, session, callback);
                    break;

                case "AMAZON.ResumeIntent":
                    Resume(player, session, callback);
                    break;

                case "AMAZON.StopIntent":
                case "AMAZON.CancelIntent":
                case "StopPlayer":
                    Stop(player, session, callback);
                    break;

                case "AMAZON.LoopOffIntent":
                    Repeat(player, false, session, callback);
                    break;

                case "AMAZON.RepeatIntent":
                    return;

                case "AMAZON.LoopOnIntent":
                    Repeat(player, true, session, callback);
                    break;

                case "AMAZON.NextIntent":
                    NextTrack(player, session, callback);
                    break;

                case "AMAZON.StartOverIntent":
                case "AMAZON.PreviousIntent":
                    PreviousTrack(player, session, callback);
                    break;

                case "AMAZON.ShuffleOffIntent":
                    StopShuffle(player, session, callback);
                    break;

                case "AMAZON.ShuffleOnIntent":
                    StartShuffle(player, session, callback);
                    break;

                case "StartPlayer":

                    // Check if we always want a new playlist on start

                    if (config.randomizeOnPlay)
                        Randomize(player, session, callback);
                    else
                        Start(player, session, callback);
                    break;

                case "PlayPlaylist":
                    PlayPlaylist(player, intent, session, callback);
                    break;

                case "RandomizePlayer":
                    Randomize(player, session, callback);
                    break;

                case "PreviousTrack":
                    PreviousTrack(player, session, callback);
                    break;

                case "NextTrack":
                    NextTrack(player, session, callback);
                    break;

                case "UnsyncPlayer":
                    Unsync(player, session, callback);
                    break;

                case "SetVolume":
                    SetVolume(player, Number(intent.slots.Volume.value), session, callback);
                    break;

                case "IncreaseVolume":
                    ChangeVolume(player, session, callback, 10);
                    break;

                case "DecreaseVolume":
                    ChangeVolume(player, session, callback, -10);
                    break;

                case "WhatsPlaying":
                    WhatsPlaying(player, session, callback);
                    break;

                case "SelectPlayer":
                    Select(player, session, callback);
                    break;

                default:
                    callback(session.attributes, Utils.buildSpeechResponse("Invalid Request", intentName + " is not a valid request", null, session.new));
                    throw " intent";
            }
        }
    }
}

module.exports = IntentMap;
