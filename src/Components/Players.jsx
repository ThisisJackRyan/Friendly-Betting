import AddFriend from "./AddFriend"
import React, { useState } from 'react';


const Players = () => {

    let json = {
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
    }
    console.log(json["friends"])
    const [displayPlayers,setDisplayPlayers] = useState(false)
    
    return (
        <div>
            {json["friends"].map((friend) => (
                <div >
                <h3>{friend["name"]}</h3>
                <p>Email: {friend["email"]}</p>
                <p>Phone Number: {friend["phone"]}</p>
                </div>
            ))}
            <div>
            {
              displayPlayers ?
              <AddFriend />
              :
              <button onClick={() => {setDisplayPlayers((current) => !current)}} >Add Friend</button>
            }
            
            </div>
        </div>
    )
}

export default Players