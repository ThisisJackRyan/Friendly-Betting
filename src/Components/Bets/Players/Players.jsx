import AddFriend from "./AddFriend"
import React, { useState } from 'react';
import css from "./Players.module.css";


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
                
                "name": "Another Person",
                "email": "Person@gmail.com",
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
        <div className="pt-12 sticky top-0 bottom-0 right-0 left-0">       
            <div className={css.friends}>
                {json["friends"].map((friend) => (
                    <div key={friend.id}>
                        <h3>{friend["name"]}</h3>
                        <p>Email: {friend["email"]}</p>
                        <p>Phone: {friend["phone"]}</p>
                    </div>
                ))}
                <div>
                {
                displayPlayers ?
                <div>
                    <AddFriend addNewPlayers ={addJson} disable={swapDisplayPlayers}/>
                    <button className={css.disable} >Add Friend</button>
                </div>
                :
                <button onClick={swapDisplayPlayers} >Add Friend</button>
                }
                
                </div>
            </div>
        </div>
    )
}

export default Players