import React from 'react';
import css from './Prop.module.css';
import { useState } from 'react';
import PreSetBettingOptions from './PreSetBettingOptions';

const CreateProp = () => {

    const [isChecked, setIsChecked] = useState(false);
    
    const handleCheckboxChange = (event) => {
        setIsChecked(event.target.checked);
    };

    const handelSubmit = (e) => {   
        e.preventDefault();
        console.log('Creating prop bet');
    }
  return (
    <div className={css.prop} >
        <form onSubmit={handelSubmit}>
            <div className={css.betContainer}>
                Proposition:
                <div className={css.bet}>
                    <textarea type="text" name="" id="" />
                </div>
            </div>
            <div className={css.settings}>
                <input type="checkbox" id="preSetBetting" checked={isChecked} onChange={handleCheckboxChange} />
                <label htmlFor="preSetBetting">Pre Set Betting Options</label>
            </div>
            <button type="submit">Create bet</button>
        </form>
        <div>
            {isChecked ? <PreSetBettingOptions display={handleCheckboxChange}/> : null}
        </div>
    </div>
  );
};

export default CreateProp;
