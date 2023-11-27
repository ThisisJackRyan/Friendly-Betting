import AddFriend from "./AddFreind"
import React, { useState } from 'react';


const Players = () => {

    const [displayPlayers,setDisplayPlayers] = useState(false)
    
    return (
        <div>
            <div>add friends</div>
            <div>Profile ID</div>
            <div>Number</div>
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