﻿using System;
using System.Collections.Generic;
using System.Linq;
using System.Web;

namespace PongR.Models
{
    public class Game
    {
        public string GameId { get; set; }
        public Player Player1 { get; set; }
        public Player Player2 { get; set; }
        public Ball Ball { get; set; }        
        public int FieldWidth { get; set; }
        public int FieldHeight { get; set; }

        public Game(string gameId, Player host, Player opponent, Ball ball)
        {
            GameId = gameId;
            Player1 = host;
            Player2 = opponent;
            Ball = ball;
            FieldWidth = 100; // 100 %
            FieldHeight = 100; // 100 %
        }
        
        public Player GetPlayer(string userId)
        {
            return Player1.User.Id == userId ? Player1 : Player2;
        }
    }
}
