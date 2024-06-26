import React from 'react';
import { useNavigate } from 'react-router-dom';
import css from './Prop.module.css';
import { useState, useEffect } from 'react';
import PreSetBettingOptions from './PreSetBettingOptions';

import { getSignedInUserInfo, isUserSignedIn } from '../../../Config/base';
import {db} from '../../../Config/firebase-config';
import { addDoc, collection } from 'firebase/firestore';

const CreateProp = () => {
    const navigate = useNavigate();

    const [bet, setBet] = useState('');
    const [Options, setOptions] = useState([]);
    const [isChecked, setIsChecked] = useState(false);

    useEffect(() => {
        if(!isUserSignedIn()){
            alert("You must be signed in to create a bet")
            navigate(`/Friendly-Betting/Bet`)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const handlesSetOptions = (options) => {
        setOptions(options);
    }
    
    const handleCheckboxChange = (event) => {
        setIsChecked(event.target.checked);
    };

    const handelSubmit = async (e) => {   
        e.preventDefault();
        try {
            const userInfo = getSignedInUserInfo();
            if(userInfo !== null) {
                const betRef = await addDoc(collection(db, "PropBets"), {
                    bet: bet,
                    options: Options,
                })
                await addDoc(collection(db, "bets"), {
                    betID: betRef.id,
                    type: "Prop",
                    bet: bet,
                    createdByID: userInfo["uid"],
                    createdByEmail: userInfo["email"],
                })
            } else {
                alert("You must be signed in to create a bet")
            }
        
            
          } catch (e) {
            console.error(e);
          }
        console.log('Creating prop bet');
    }
  return (
    <div className='flex'>
        <div className={css.prop} >
            <form onSubmit={handelSubmit}>
                <div className={`flex flex-col gap-4 pb-8 ${css.betContainer}`}>
                    Proposition:
                    <div>
                        <textarea className="betTextarea" type="text" onChange={(e) => {setBet(e.target.value)}} />
                    </div>
                </div>
                <div className="flex gap-4 m-4">
                    <input type="checkbox" id="preSetBetting" checked={isChecked} onChange={handleCheckboxChange} />
                    <label className={css.settings} htmlFor="preSetBetting">Pre Set Betting Options</label>
                </div>
                <button type="submit">Create bet</button>
            </form>
        </div>
            <div>
                {isChecked ? <PreSetBettingOptions setOptions={handlesSetOptions} display={handleCheckboxChange}/> : null}
            </div>
            
    </div>
  );
};

export default CreateProp;
