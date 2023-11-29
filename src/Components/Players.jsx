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
       
    }
    const [displayPlayers,setDisplayPlayers] = useState(false)
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
              <AddFriend addNewPlayers ={addJson} />
              :
              <button onClick={() => {setDisplayPlayers((current) => !current)}} >Add Friend</button>
            }
            
            </div>
        </div>
    )
}

export default Players