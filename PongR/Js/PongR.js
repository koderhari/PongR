﻿/*
* Author: Valerio Gheri
* Date: 28/08/2012
* Description: PongR namespace js file with the Module pattern
*/

// Module creation
var PongR = (function ($, ko) {

    var pongR = {
        PublicPrototype: { UnitTestPrototype: {} }
    };

    // Used in the logic section
    var me;
    var keyboard;
    var requestAnimationFrameRequestId;
    var physicsLoopId;

    // Models
    function Point(x, y) {
        this.x = x;
        this.y = y;
    };

    function Viewport(width, height) {
        this.width = width;
        this.height = height;
    };

    function User(username, connectionId) {
        this.username = ko.observable(username);
        this.connectionId = connectionId;
    };

    function Input(commands, sequenceNumber) {
        this.commands = commands;
        this.sequenceNumber = sequenceNumber;
    };

    function Player(user, playerNumber, fieldWidth) {
        var self = this;
        this.user = new User(user.Username, user.Id);
        this.playerNumber = playerNumber;
        this.barWidth = 30;
        this.barHeight = 96;
        this.topLeftVertex = null;
        if (playerNumber === 1) {
            this.topLeftVertex = new Point(50, 252);
        }
        else {
            var xValue = fieldWidth - 50 - this.barWidth;
            this.topLeftVertex = new Point(xValue, 252);
        }
        this.barDirection = ""; // Can be empty (i.e. not moving), up or down
        this.inputs = []; // Local history of inputs for this client. Each input is of type myPongR.Input
        this.score = ko.observable(0);
        this.lastProcessedInputId = -1;
        this.resetPositionAndDirection = function (fieldWidth) {
            self.barDirection = "";
            if (self.playerNumber === 1) {
                self.topLeftVertex = new Point(50, 252);
            }
            else {
                var xValue = fieldWidth - 50 - self.barWidth;
                self.topLeftVertex = new Point(xValue, 252);
            }
        };
    };

    function Ball(direction, fieldWidth, fieldHeight) {
        var self = this;
        this.radius = 10;
        this.position = new Point(fieldWidth / 2, fieldHeight / 2); // The ball starts at the center of the field
        this.direction = direction; // can be left or right        
        this.angle = (direction === "right" ? 0 : 180);
        this.resetPositionDirectionAndAngle = function (fieldWidth, fieldHeight, direction, angle) {
            self.position = new Point(fieldWidth / 2, fieldHeight / 2);
            self.direction = direction;
            self.angle = angle;
        };
    };

    function Settings(width, height) {
        this.viewport = new Viewport(width, height); // The viewport size as passed by the client
        this.naive_approach = true; // default : true. Means we won't use lag compensation
        this.client_prediction = true;
        this.input_sequence = 0; //When predicting client inputs, we store the last input as a sequence number        
        this.client_smoothing = false;  //Whether or not the client side prediction tries to smooth things out
        this.client_smooth = 25;        //amount of smoothing to apply to client update dest
        this.gap = 30; // px. Minimum distance between the player and the field delimiters (up and down)
        this.BAR_SCROLL_UNIT = 5; // px
        this.BALL_FIXED_STEP = 10; // px is the fixed distance that the ball moves (both over x and y axis) between 2 frames
    };

    function Game(id, player1, player2, ballDirection) {
        this.gameId = id;
        this.player1 = new Player(player1, 1, pongR.settings.viewport.width);
        this.player2 = new Player(player2, 2, pongR.settings.viewport.width);
        this.ball = new Ball(ballDirection, pongR.settings.viewport.width, pongR.settings.viewport.height);
    };

    // Logic

    function startAnimation() {
        requestAnimationFrameRequestId = window.requestAnimationFrame(startUpdateLoop);
    };

    function clearAnimation() {
        window.cancelAnimationFrame(requestAnimationFrameRequestId);
    };

    function startPhysicsLoop() {
        physicsLoopId = window.setInterval(updatePhysics, 15);
    };

    function clearPhysicsLoop() {
        window.setInterval(physicsLoopId);
    };

    function updatePlayerState(clientPlayer, serverPlayer) {
        clientPlayer.barDirection = serverPlayer.BarDirection;
        clientPlayer.topLeftVertex.x = convertToPixels(serverPlayer.TopLeftVertex.X);
        clientPlayer.topLeftVertex.y = convertToPixels(serverPlayer.TopLeftVertex.Y);
        clientPlayer.score(serverPlayer.Score);
        clientPlayer.lastProcessedInputId = serverPlayer.LastProcessedInputId
    };

    function updateBallState(serverBall) {
        pongR.game.ball.position.x = convertToPixels(serverBall.Position.X);
        pongR.game.ball.position.y = convertToPixels(serverBall.Position.Y);
        pongR.game.ball.direction = serverBall.Direction;
        pongR.game.ball.angle = serverBall.Angle;
    };

    function ResetPositionsToInitialState(serverGame) {
        pongR.game.player1.resetPositionAndDirection(pongR.settings.viewport.width);
        pongR.game.player2.resetPositionAndDirection(pongR.settings.viewport.width);
        pongR.game.ball.resetPositionDirectionAndAngle(pongR.settings.viewport.width, pongR.settings.viewport.height,
                                                            serverGame.Ball.Direction, serverGame.Ball.Angle);
    }

    function convertToPixels(position) {
        // At the moment we are communicating using directly pixel values, so we just return the value
        return position;
    };

    //calculateNewAngleAfterPlayerHit(player : Player, newBallDirection : string) : number
    //Calculates new angle after a ball collision with a player
    function calculateNewAngleAfterPlayerHit(player, newBallDirection) {
        var angle;
        if (newBallDirection === "right" && player.barDirection === "") {
            angle = 0;
        }
        else if (newBallDirection === "right" && player.barDirection === "up") {
            angle = 45;
        }
        else if (newBallDirection === "left" && player.barDirection === "up") {
            angle = 135;
        }
        else if (newBallDirection === "left" && player.barDirection === "") {
            angle = 180;
        }
        else if (newBallDirection === "left" && player.barDirection === "down") {
            angle = 225;
        }
        else if (newBallDirection === "right" && player.barDirection === "down") {
            angle = 315;
        }
        else {
            console.log("Error! Unkown new angle value: hit on player :" + player.playerNumber.toString() + ". New ball direction: " + newBallDirection + ". Player direction: " + (player.barDirection !== "" ? player.barDirection : "none"));
            return undefined;
        }
        return angle;
    };

    //calculateNewAngleAfterFieldHit(oldAngle : number, ballDirection : string) : number
    //Calculates new angle after a ball collision with the field
    function calculateNewAngleAfterFieldHit(oldAngle, ballDirection) {
        var newAngle;
        if (ballDirection === "right" && oldAngle === 45) {
            newAngle = 315;
        }
        else if (ballDirection === "right" && oldAngle === 315) {
            newAngle = 45;
        }
        else if (ballDirection === "left" && oldAngle === 135) {
            newAngle = 225;
        }
        else if (ballDirection === "left" && oldAngle === 225) {
            newAngle = 135;
        }
        else {
            console.log("Unknown new angle value upon hit on field delimiters. Ball direction: " + ballDirection + ". Ball old angle: " + oldAngle);
            return undefined;
        }
        return newAngle;
    };

    //checkCollisionWithPlayer(player : Player, ball : Ball) : boolean 
    //Check if the ball hits one of the player
    function checkCollisionWithPlayer(player, ball) {
        var collision = false;

        // If player is on the left, then we need to substract the radius, otherwise add
        var relativeRadius = player.playerNumber === 1 ? (0 - ball.radius) : ball.radius;

        if (player.topLeftVertex.x <= ball.position.x + relativeRadius && player.topLeftVertex.x + player.barWidth >= ball.position.x + relativeRadius) {
            if ((player.topLeftVertex.y <= ball.position.y + ball.radius)
                && (player.topLeftVertex.y + player.barHeight >= ball.position.y - ball.radius)) {
                collision = true;
            }
        }

        return collision;
    };

    //checkCollisionWithFieldDelimiters(ball : Ball, fieldWidth : number, fieldHeight : number) : boolean
    //Check if the ball hits one of the sides of the field 
    function checkCollisionWithFieldDelimiters(ball, fieldWidth, fieldHeight) {
        var collision = false;
        // Hit check. I check first for y axis because it's less frequent that the condition will be true, so most of the time 
        // we check only 1 if statement instead of 2 
        // We consider a hit when the ball is very close to the field delimiter (+/-5 px)
        if ((ball.position.y - ball.radius >= -5 && ball.position.y - ball.radius <= 5) ||
                (ball.position.y + ball.radius >= fieldHeight - 5 && ball.position.y + ball.radius <= fieldHeight + 5)) {
            if (ball.position.x - ball.radius >= 0 && ball.position.x + ball.radius <= fieldWidth) {
                collision = true;
            }
        }

        return collision;
    };

    //updateBallPosition(angle, position) : Point 
    //Updates the position of the ball based on its direction and its angle
    function updateBallPosition(angle, position) {
        var newPosition = { x: position.x, y: position.y };
        switch (angle) {
            case 0:
                newPosition.x = position.x + pongR.settings.BALL_FIXED_STEP;
                break;
            case 45:
                newPosition.x = position.x + pongR.settings.BALL_FIXED_STEP;
                newPosition.y = position.y - pongR.settings.BALL_FIXED_STEP;
                break;
            case 135:
                newPosition.x = position.x - pongR.settings.BALL_FIXED_STEP;
                newPosition.y = position.y - pongR.settings.BALL_FIXED_STEP;
                break;
            case 180:
                newPosition.x = position.x - pongR.settings.BALL_FIXED_STEP;
                break;
            case 225:
                newPosition.x = position.x - pongR.settings.BALL_FIXED_STEP;
                newPosition.y = position.y + pongR.settings.BALL_FIXED_STEP;
                break;
            case 315:
                newPosition.x = position.x + pongR.settings.BALL_FIXED_STEP;
                newPosition.y = position.y + pongR.settings.BALL_FIXED_STEP;
                break;
            default:
                if (pongR.game.ball.angle !== undefined) {
                    console.log("Unknown angle value " + pongR.game.ball.angle.toString());
                }
                return undefined;
        }
        return newPosition;
    };

    //process_input(player : Player) : number 
    //Computes the increment on the Y axis, given a player list of inputs
    function process_input(player) {
        //It's possible to have received multiple inputs by now, so we process each one        
        // Each input is an object structured like:
        // commands: list of commands (i.e. a list of "up"/"down")
        // sequenceNumber: the sequence number for this batch of inputs
        var y_dir = 0;
        var ic = player.inputs.length;
        if (ic) {
            for (var j = 0; j < ic; ++j) {
                //don't process ones we already have simulated locally
                if (player.inputs[j].sequenceNumber <= player.lastProcessedInputId) continue;

                var input = player.inputs[j].commands;
                var c = input.length;
                for (var i = 0; i < c; ++i) {
                    var key = input[i];
                    if (key == 'up') {
                        y_dir -= pongR.settings.BAR_SCROLL_UNIT;
                        player.barDirection = "up";
                    }
                    else if (key == 'down') {
                        y_dir += pongR.settings.BAR_SCROLL_UNIT;
                        player.barDirection = "down";
                    }
                } //for all input values

            } //for each input command
        } //if we have inputs
        else {
            // We didn't move
            player.barDirection = "";
        }

        if (player.inputs.length) {
            //we can now update the sequence number for the last batch of input processed 
            // and then clear the array since these have been processed            
            player.lastProcessedInputId = player.inputs[ic - 1].sequenceNumber;
            player.inputs.splice(0, ic);
        }

        //give it back
        return y_dir;
    };

    //updateSelfPosition(topLeftVertex : Point, yIncrement : number, fieldHeight : number, settings.gap : number) : Point 
    // Updates self position. If we are not too close, we move completely, otherwise we are set to the gap
    // Gap is defined as the minimum distance between the player and the field delimiters (up and down) is 30 px
    function updateSelfPosition(topLeftVertex, yIncrement, fieldHeight, gap) {
        var newTopLeftVertex = { x: topLeftVertex.x, y: topLeftVertex.y };
        if ((topLeftVertex.y + yIncrement >= gap) && (topLeftVertex.y + yIncrement <= fieldHeight - gap)) {
            newTopLeftVertex.y += yIncrement;
        }
        else if (topLeftVertex.y + yIncrement < gap) {
            newTopLeftVertex.y = gap;
        }
        else {
            newTopLeftVertex.y = fieldHeight - gap;
        }
        return newTopLeftVertex;
    };

    // PRIVATE
    // Draws a frame of the game: the two players and the ball
    function draw() {
        drawField();
        drawPlayer(pongR.game.player1);
        drawPlayer(pongR.game.player2);
        drawBall();
    };

    function drawField() {
        //Set the color for this player
        pongR.canvasContext.fillStyle = "#111111"; // Almost Black
        //Draw a rectangle for us
        pongR.canvasContext.fillRect(0, 0, pongR.settings.viewport.width, pongR.settings.viewport.height);
    };

    function drawBall() {
        //Set the color for this player
        pongR.canvasContext.fillStyle = "#EE0000"; // Red
        //Draw a circle for us
        pongR.canvasContext.beginPath();
        pongR.canvasContext.arc(pongR.game.ball.position.x, pongR.game.ball.position.y, pongR.game.ball.radius, 0, 2 * Math.PI);
        pongR.canvasContext.fill();
    };

    function drawPlayer(player) {
        //Set the color for this player
        pongR.canvasContext.fillStyle = "#00FF00"; // Light Green
        //Draw a rectangle for us
        pongR.canvasContext.fillRect(player.topLeftVertex.x, player.topLeftVertex.y, player.barWidth, player.barHeight);
    };

    function drawMessage(message) {
        pongR.canvasContext.font = '20px "Helvetica"';
        pongR.canvasContext.fillStyle = "#EE0000"; // Red
        pongR.canvasContext.fillText(message, 450, 280);
    };

    // This takes input from the client and keeps a record. 
    // It also sends the input information to the server immediately
    // as it is pressed. It also tags each input with a sequence number.
    function handleClientInputs(player) {

        var input = [];
        pongR.client_has_input = false; // TODO check why this variable is public
        var playerInput = null;

        var count = keyboard.pressed('up');
        for (var i = 0; i < count; i++) {
            input.push('up');
        } // up

        count = keyboard.pressed('down');
        for (var i = 0; i < count; i++) {
            input.push('down');
        } // down

        if (input.length) {

            //Update what sequence we are on now
            pongR.settings.input_sequence += 1;

            //Store the input state as a snapshot of what happened.
            playerInput = {
                sequenceNumber: pongR.settings.input_sequence,
                commands: input
            };

            me.inputs.push(playerInput);
        }

        return playerInput;
    };

    // A single step of the client update loop (a frame)
    function updateLoopStep() {
        // Step 1: Clear canvas
        pongR.canvasContext.clearRect(0, 0, pongR.settings.viewport.width, pongR.settings.viewport.height);
        // Step 2: Handle user inputs (update internal model)
        var playerInput = handleClientInputs(me);
        if (playerInput !== null) {
            // Step 3: Send the just processed input batch to the server.
            sendInput(pongR.game.gameId, me.user.connectionId, playerInput);
        }
        // Step 3: Draw the new frame in the canvas
        draw(pongR.game, pongR.canvasContext);
    };

    // Starts the client update loop 
    function startUpdateLoop() {
        updateLoopStep();

        // From MDN https://developer.mozilla.org/en-US/docs/DOM/window.requestAnimationFrame  
        // Your callback routine must itself call requestAnimationFrame() unless you want the animation to stop.
        // We use requestAnimationFrame so that the the image is redrawn as many times as possible per second
        startAnimation(startUpdateLoop, pongR.canvas);
    };

    // PRIVATE - At each step of the game, checks for any collision, and updates the app internal state
    function checkForCollisionsAndUpdateBallState() {
        var collision = false;
        var newAngle = -1;
        // if collision with players' bar or field, update ball state (set next angle, next direction etc...)
        collision = checkCollisionWithPlayer(pongR.game.player1, pongR.game.ball);
        if (collision) {
            pongR.game.ball.direction = "right";
            pongR.game.ball.angle = calculateNewAngleAfterPlayerHit(pongR.game.player1, pongR.game.ball.direction);
        }
        else {
            collision = checkCollisionWithPlayer(pongR.game.player2, pongR.game.ball);
            if (collision) {
                pongR.game.ball.direction = "left";
                pongR.game.ball.angle = calculateNewAngleAfterPlayerHit(pongR.game.player2, pongR.game.ball.direction);
            }
            // No collision with players, let's check if we have a collision with the field delimiters
            else {
                collision = checkCollisionWithFieldDelimiters(pongR.game.ball, pongR.settings.viewport.width, pongR.settings.viewport.height);
                if (collision) {
                    pongR.game.ball.angle = calculateNewAngleAfterFieldHit(pongR.game.ball.angle, pongR.game.ball.direction);
                }
            }
        }
    };

    function updatePhysics() {
        // 1: updates self position and direction
        //var yIncrement = this.process_input(me);
        var yIncrement = process_input(me);
        var newPosition = updateSelfPosition(me.topLeftVertex, yIncrement, pongR.settings.viewport.height, pongR.settings.gap);
        me.topLeftVertex = newPosition;
        // 2: update ball position
        var newPosition = updateBallPosition(pongR.game.ball.angle, pongR.game.ball.position);
        pongR.game.ball.position = newPosition;
        // 2: check collision
        checkForCollisionsAndUpdateBallState();
    };

    // Initial setup of the match state and start of the game interval
    function startMatch(opts) {
        // Proposal: app is now a global var... make it private
        pongR.game = new Game(opts.PlayRoomId, opts.Player1, opts.Player2, opts.BallDirection);

        // Proposal: I can extract the following blocks of code into a function to retrieve the current canvas context
        // Set the canvas dimensions
        pongR.canvas = document.getElementById("viewport");
        pongR.canvas.width = pongR.settings.viewport.width;
        pongR.canvas.height = pongR.settings.viewport.height;

        // Get the 2d context to draw on the canvas
        // getContext() returns an object that provides methods and properties for drawing on the canvas.
        pongR.canvasContext = pongR.canvas.getContext("2d");

        if (opts.Player1.Username === pongR.pongRHub.username) {
            me = pongR.game.player1;
        }
        else {
            me = pongR.game.player2;
        }

        ko.applyBindings(pongR.game);

        // Start the physics loop
        startPhysicsLoop();

        // Initialise keyboard handler
        keyboard = new THREEx.KeyboardState();

        //A list of recent server updates
        pongR.serverUpdates = [];

        // Start the update loop
        startUpdateLoop();
    };

    // SignalR functions

    function opponentLeft() {
        alert("Opponent left. Going back to wait list");
        //pongR.clearAnimation(requestAnimationFrameRequestId);            
        // TODO Implement a method that resets the game: names, score, objects position (resetAllPositionsToInitialState())
    };

    function wait() {
        // TODO: Use a lightbox to display a waiting message
        alert("Wait. Do nothing.");
    };

    function setupMatch(opts) {
        startMatch(opts);
    };

    // Receives an updated game state from the server. Being the server authoritative, means that we have to apply this state to our current state
    function updateGame(game) {
        var goalInfo = { goal: false, playerWhoScored: -1 };
        if (pongR.game.player1.score() < game.Player1.Score) {
            goalInfo.goal = true;
            goalInfo.playerWhoScored = 1;
        }
        else if (pongR.game.player2.score() < game.Player2.Score) {
            goalInfo.goal = true;
            goalInfo.playerWhoScored = 2;
        }
        if (goalInfo.goal) {
            // Only update score
            pongR.game.player1.score(game.Player1.Score);
            pongR.game.player2.score(game.Player2.Score);
            // Then reset positions
            ResetPositionsToInitialState(game);            
            /*
            clearAnimation();
            clearPhysicsLoop();
            var text = "Goal";
            drawMessage(text);
            window.setTimeout(restartGame, 2000); // Wait for 2 secs and then re-start animation            
            */
        }
        else {
            // Player 1
            updatePlayerState(pongR.game.player1, game.Player1);
            // Player 2
            updatePlayerState(pongR.game.player2, game.Player2);
            // Ball
            updateBallState(game.Ball);
        }

    };

    function restartGame() {
        startPhysicsLoop();
        startUpdateLoop();
    }

    // sendInput(gameId : number, connectionId : string, input : PlayerInput) : void
    function sendInput(gameId, connectionId, input) {
        pongR.pongRHub.queueInput(gameId, connectionId, input);
    }

    // Public methods
    pongR.PublicPrototype.createInstance = function (width, height, username) {
        pongR.settings = new Settings(width, height);
        pongR.pongRHub = $.connection.pongRHub;
        pongR.pongRHub.username = username;
        pongR.pongRHub.opponentLeft = opponentLeft;
        pongR.pongRHub.wait = wait;
        pongR.pongRHub.setupMatch = setupMatch;
        pongR.pongRHub.updateGame = updateGame;
    }

    pongR.PublicPrototype.connect = function () {
        $.connection.hub.start()
                    .done(function () {
                        pongR.pongRHub.joined();
                    });
    };

    pongR.PublicPrototype.UnitTestPrototype.calculateNewAngleAfterPlayerHit = calculateNewAngleAfterPlayerHit;
    pongR.PublicPrototype.UnitTestPrototype.calculateNewAngleAfterFieldHit = calculateNewAngleAfterFieldHit;
    pongR.PublicPrototype.UnitTestPrototype.checkCollisionWithPlayer = checkCollisionWithPlayer;
    pongR.PublicPrototype.UnitTestPrototype.checkCollisionWithFieldDelimiters = checkCollisionWithFieldDelimiters;
    pongR.PublicPrototype.UnitTestPrototype.updateBallPosition = updateBallPosition;
    pongR.PublicPrototype.UnitTestPrototype.process_input = process_input;
    pongR.PublicPrototype.UnitTestPrototype.updateSelfPosition = updateSelfPosition;
    pongR.PublicPrototype.UnitTestPrototype.updateGame = updateGame;

    return pongR.PublicPrototype;
} (jQuery, ko));