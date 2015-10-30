'use strict';

var _ = require('../shims/underscore.js'),
    App = require('../app.js'),
    Ctx = require('../common/context.js');

/**
 * @class Socket
 *
 * @param {string} url
 */
var Socket = function(connectCallback) {
  this.connectCallback = connectCallback;
  if (start_application) {
    this.init();
  }
};

/**
 * @const
 */
Socket.STATE_CLOSED = 0;
Socket.STATE_CONNECTING = 1;
Socket.STATE_OPEN = 2;
Socket.CONNECTION_TIMEOUT_TIME = 5000;

/**
 * @init
 */
Socket.prototype.init = function() {
  this.socket = new SockJS(Ctx.getSocketUrl());
  this.socket.onopen = this.onOpen.bind(this);
  this.socket.onmessage = this.onMessage.bind(this);
  this.socket.onclose = this.onClose.bind(this);
  this.state = Socket.STATE_CLOSED;
};

/**
 * Triggered when the connection opens
 * @event
 */
Socket.prototype.onOpen = function() {
  this.socket.send("token:" + Ctx.getCsrfToken());
  this.socket.send("discussion:" + Ctx.getDiscussionId());
  this.state = Socket.STATE_CONNECTING;
};

/**
 * Triggered when the client receives a message from the server
 * @event
 */
Socket.prototype.onMessage = function(ev) {
  if (this.state === Socket.STATE_CONNECTING) {
    this.connectCallback(this);
    App.vent.trigger('socket:open');
    this.state = Socket.STATE_OPEN;
  }

  var data = JSON.parse(ev.data),
      i = 0,
      len = data.length;

  for (; i < len; i += 1) {
    this.processData(data[i]);
  }

  App.commands.execute('socket:message');
};

/**
 * Triggered when the connection closes ( or lost the connection )
 * @event
 */
Socket.prototype.onClose = function() {
  App.vent.trigger('socket:close');

  var that = this;
  window.setTimeout(function() {
    that.init();
  }, Socket.CONNECTION_TIMEOUT_TIME);
};

/**
 * Processes one item from a data array from the server
 * @param  {Object]} item
 */
Socket.prototype.processData = function(item) {
  var CollectionManager = require('../common/collectionManager.js'),
      collectionManager = new CollectionManager(),
      collPromise = collectionManager.getCollectionPromiseByType(item);

  if (Ctx.debugSocket) {
    console.log("On socket:", item['@type'], item['@id'], item);
  }

  if (collPromise === null) {
    if (item['@type'] == "Connection") {
      //Ignore Connections
      return;
    } 
    else {
      if (Ctx.debugSocket) {
        console.log("Socket.prototype.processData(): TODO: Handle socket events for items of type:", item['@type'], item);
      }
      return;
    }
  }

  // Each collection must know what to do
  collPromise.done(function(collection) {
    collection.updateFromSocket(item);
  });
};

module.exports = Socket;
