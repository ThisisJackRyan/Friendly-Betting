import React, { useState, useEffect } from 'react';
import css from './Prop.module.css';

const PreSetBettingOptions = () => {
    const [howMany, setHowMany] = useState(0);
    const [howManyOptions, setHowManyOptions] = useState([]);

    const addOneMore = () => {
        setHowMany(howMany + 1);
    }

    useEffect(() => {
        let options = [];
        for (let i = 0; i < howMany; i++) {
            options.push(i);
        }
        setHowManyOptions(options);
    }, [howMany]);

    const handleSubmit = (e) => {

    }

    return (
        <div className={css.PreSetBetting}>
            <div className={css.x}><span>x</span></div>
            <div className={css.title}><span>Preset Betting Options</span></div>
            <form onSubmit={handleSubmit}>
                {howManyOptions.map((option, index) => (
                    <div key={index}>
                        <span className={css.label}>{option+1}:</span>
                        <input type="text" placeholder='Who or what' />
                    </div>
                ))}
            </form>
            <button onClick={addOneMore}>Add Option</button>
            <button type="submit">Save</button>
        </div>
    );
};

export default PreSetBettingOptions;