const Discord = require("discord.js");
const client = new Discord.Client();
const ytdl = require("ytdl-core");
const request = require("request");
const fs = require("fs");
const getYoutubeID = require("get-youtube-id");
const fetchVideoInfo = require("youtube-info");

const youtube = require("./youtube.js");

const yt_api_key = process.env.yt_api_key;
const bot_controller = process.env.bot_controller;
const prefix = process.env.prefix;
const discord_token = process.env.discord_token;
const channel_id = process.env.channel_id;

var queue = [];
var queueNames = [];
var isPlaying = false;
var dispatcher = null;
var voiceChannel = null;
var skipReq = 0;
var skippers = [];

console.log("Connexion à l'API youtube")
youtube.setApiKey(yt_api_key);

client.login(discord_token);

client.on('message', function (message) {
  const member = message.member;
  const mess = message.content.toLowerCase();
  const args = message.content.split(' ').slice(1).join(" ");
  if(message.channel.id != channel_id){
    if (mess.startsWith(prefix + 'play')) {
      if (member.voiceChannel || voiceChannel != null) {
        if (queue.length > 0 || isPlaying) {
          if (args.toLowerCase().indexOf("list=") === -1) {
            youtube.getID(args, function(id) {
              if (id != -1){
                add_to_queue(id);
                fetchVideoInfo(id, function(err, videoInfo) {
                  if (err) throw new Error(err);
                  var date = new Date(null);
                  date.setSeconds(videoInfo.duration); // specify value for SECONDS here
                  var result = date.toISOString().substr(11, 8);

                  message.reply(" **" + videoInfo.title + "** (" + result + ") ajouté à la liste.");
                  queueNames.push(videoInfo.title);
                });
              } else {
                message.reply("La requête n'a rien donné");
              }
            });
          } else {
            youtube.getPlayListSongs(args.match(/list=(.*)/)[args.match(/list=(.*)/).length - 1], 50, function(arr) {
              if (arr != -1){
                arr.forEach(function(e) {
                  add_to_queue(e.snippet.resourceId.videoId);
                  queueNames.push(e.snippet.title);
                });
                youtube.getPlayListMetaData(args.match(/list=(.*)/)[args.match(/list=(.*)/).length - 1], 50, function(data) {

                  message.reply(" playlist **" + data.snippet.title + "** ajouté à la liste.");
                });
              } else {
                message.reply("La requête n'a rien donné");
              }
            });
          }
        } else {
          isPlaying = true;
          if (args.toLowerCase().indexOf("list=") === -1) {
            // console.log(args.toLowerCase().indexOf("list=") === -1);
            youtube.getID(args, function(id) {
              if (id != -1){
                queue.push(id);
                fetchVideoInfo(id, function(err, videoInfo) {
                  if (err) throw new Error(err);
                  queueNames.push(videoInfo.title);
                  var date = new Date(null);
                  date.setSeconds(videoInfo.duration); // specify value for SECONDS here
                  var result = date.toISOString().substr(11, 8);

                  message.reply(" lecture de **" + videoInfo.title + "** (" + result + ").");
                  playMusic(id, message);
                });

              } else {
                message.reply("La requête n'a rien donné");
              }
            });
          } else {
            youtube.getPlayListSongs(args.match(/list=(.*)/)[args.match(/list=(.*)/).length - 1], 50, function(arr) {
              if (arr != -1){
                arr.forEach(function(e) {
                  add_to_queue(e.snippet.resourceId.videoId);
                  queueNames.push(e.snippet.title);
                });

                youtube.getPlayListMetaData(args.match(/list=(.*)/)[args.match(/list=(.*)/).length - 1], 50, function(data) {
                  message.reply(" playlist **" + data.snippet.title + "** ajouté à la liste.");
                });

                playMusic(queue[0], message);

              } else {
                message.reply("La requête n'a rien donné");
              }
            });
          }
        }
      } else {
        message.reply('Vous devez être présent dans un channel vocal !');
      }
    } else if (mess.startsWith(prefix + 'skip')) {
      if (skippers.indexOf(message.author.id) == -1) {
        skippers.push(message.author.id);
        skipReq++;
        if (skipReq >= Math.ceil((voiceChannel.members.size - 1) / 2)) {
          message.reply(" votre vote a bien été pris en compte. Passage à la musique suivante !");
          skip_song();
          if(isPlaying || queueNames[0] == "undefined")  message.reply(" la musique actuelle est : *" + queueNames[0] + "*");
          else  message.reply(" fin de la playlist.");
        } else {
          message.reply(" votre vote a bien été pris en compte. Encore **" + ((Math.ceil((voiceChannel.members.size - 1) / 2)) - skipReq) + "** votes pour passer à la musique suivante.");
        }
      } else {
        message.reply(" vous avez déjà voté !");
      }
    } else if (mess.startsWith(prefix + 'fskip') && member.roles.has(bot_controller)) {
      try {
        message.reply(" passage à la musique suivante !");
        skip_song();
        if(isPlaying || queueNames[0] == "undefined")  message.reply(" la musique actuelle est : *" + queueNames[0] + "*");
        else  message.reply(" fin de la playlist.");
      } catch (err) {
        console.log(err);
      }
    } else if (mess.startsWith(prefix + "queue")) {
      var emb = "\n";

      for (var i = 0; i < queueNames.length; i++) {
        if(i === 0) emb += ("__**" + (i + 1) + ":**__ `" + queueNames[i] + "**(Musique actuelle)**`\n\n");
        else emb += ("__**" + (i + 1) + ":**__ `" + queueNames[i] + "`\n\n");
      }

      if(emb != "") message.reply(emb);
      else message.reply("Aucune musique dans la playlist");

    } else if (mess.startsWith(prefix + "song")) {
      if(isPlaying)  message.reply(" la musique actuelle est : *" + queueNames[0] + "*");
      else  message.reply(" aucune musique en cours.");
    } else if (mess.startsWith(prefix + "kill") && member.roles.has(bot_controller)) {
      if(voiceChannel != null){
        voiceChannel.leave();
        client.user.setActivity("Entrez " + prefix + "help pour l'aide");
        message.channel.send("Bye !");
        queue = [];
        queueNames = [];
        isPlaying = false;
        dispatcher = null;
        voiceChannel = null;
        skipReq = 0;
        skippers = [];
      }
    } else if (mess.startsWith(prefix + 'pause') && member.roles.has(bot_controller)) {
      try {
        dispatcher.pause();
        message.reply("Mise en pause !");
      } catch (error) {
        message.reply("Aucune musique en cours.");
      }
    } else if (mess.startsWith(prefix + 'resume') && member.roles.has(bot_controller)) {
      try {
        dispatcher.resume();
        message.reply("Lecture !");
      } catch (error) {
        message.reply("Aucune musique en cours.");
      }
    } else if (mess.startsWith(prefix + 'help')) {
      message.reply({embed: {
        color: 0xff0000,
        author: {
          name: client.user.username,
          icon_url: client.user.avatarURL
        },
        title: "Commandes pour le bot musique",

        description: "Voici les commandes pour le bot",
        fields: [{
          name: prefix + "play (URL/Nom de vidéo/Playlist)",
          value: "lance une musique et rejoins le channel vocal"
        },
        {
          name: prefix + "pause",
          value: "mets en pause la musique actuelle (nécessite le role Dj)"
        },
        {
          name: prefix + "resume",
          value: "remets en route la musique actuelle (nécessite le role Dj)"
        },
        {
          name: prefix + "queue",
          value: "affiche la liste des musiques"
        },
        {
          name: prefix + "song",
          value: "affiche la musique actuelle"
        },
        {
          name: prefix + "skip",
          value: "lance un vote pour passer à la musique suivante"
        },

        {
          name: prefix + "fskip",
          value: "force le passage à la musique suivante (nécessite le role Dj)"
        },

        {
          name: prefix + "help",
          value: "affiche cette liste"
        },

        {
          name: prefix + "kill",
          value: "déconnecte le bot du channel vocal"
        },
      ],
      timestamp: new Date(),
      footer: {
        icon_url: client.user.avatarURL,
        text: "botMusicCalvin :3"
      }
    }
  });
}

}});



client.on('ready', function () {
  console.log('Bot prêt !');
  client.user.setActivity("Entrez " + prefix + "help pour l'aide");
});

function skip_song() {
  dispatcher.end();
}

function playMusic(id, message) {
  voiceChannel = message.member.voiceChannel || voiceChannel;
  if (voiceChannel != null) {
    voiceChannel.join()
    .then(function(connection) {
      stream = ytdl("https://www.youtube.com/watch?v=" + id, {
        filter: 'audioonly'
      });
      skipReq = 0;
      skippers = [];

      client.user.setActivity(queueNames[0]);

      dispatcher = connection.playStream(stream);
      dispatcher.on('end', function() {
        skipReq = 0;
        skippers = [];
        queue.shift();
        queueNames.shift();
        if (queue.length === 0) {
          queue = [];
          queueNames = [];
        } else {
          playMusic(queue[0], message);
        }
      });
    });
  } else {
    message.reply(" vous, ou le bot, devez être présent dans un channel audio pour pouvoir faire ça !");
  }
}

function shuffle(array) {
  var currentIndex = array.length,
  temporaryValue, randomIndex;

  while (1 !== currentIndex) {

    randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex -= 1;

    temporaryValue = array[currentIndex];
    array[currentIndex] = array[randomIndex];
    array[randomIndex] = temporaryValue;
  }

  return array;
}

function add_to_queue(strID) {
  if (youtube.isYoutube(strID)) {
    queue.push(getYouTubeID(strID));
  } else {
    queue.push(strID);
  }
}
