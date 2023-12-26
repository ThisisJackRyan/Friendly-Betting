import AddFriend from "./AddFriend"
import React, { useState } from 'react';


const Players = () => {

    const [json,setJson] = useState({
        "friends": [
            
            {
               
            
                "name": "John",
                "email": "johnRyan@gmail.com",
                "phone": "1234567890"
                    
                
            },
            {
                
                "name": "Jack",
                "email": "JackRyan@gmail.com",
                "phone": "1234567890"
                    
                
            },
            {
                
                "name": "Matt",
                "email": "Wilson@gmail.com",
                "phone": "1234567890"
                    
                
            }
            
        ]
    });
    const addJson = (newJson) => {
        setJson(prevJson => ({
            ...prevJson,
            friends: [...prevJson.friends, newJson]
            
        }));
        swapDisplayPlayers();
       
    }
    const [displayPlayers, setDisplayPlayers] = useState(false)
    const swapDisplayPlayers = () => {
        setDisplayPlayers((current) => !current)
    }
    return (
        <div>
            {json["friends"].map((friend) => (
                <div key={friend.id}>
                <h3>{friend["name"]}</h3>
                <p>Email: {friend["email"]}</p>
                <p>Phone Number: {friend["phone"]}</p>
                </div>
            ))}
            <div>
            {
              displayPlayers ?
              <div>
                <AddFriend addNewPlayers ={addJson} disable={swapDisplayPlayers}/>
                <button className="disable" >Add Friend</button>
              </div>
              :
            <button onClick={swapDisplayPlayers} >Add Friend</button>
            }
            
            </div>
        </div>
    )
}

export default Players